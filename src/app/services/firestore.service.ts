import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, onSnapshot, deleteDoc, writeBatch, getDocs, query, orderBy } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, BehaviorSubject, Subject } from 'rxjs';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  statusLabel: string;
}

export interface BoardColumn {
  id: string;
  title: string;
  statusLabel: string;
  accent: 'todo' | 'progress' | 'done' | 'custom';
  tasks: Task[];
  isDefault: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class FirestoreService {
  private firestore = inject(Firestore);
  private auth = inject(Auth);
  private boardSubject = new BehaviorSubject<BoardColumn[]>([]);
  public board$ = this.boardSubject.asObservable();
  
  // Subject for tracking local changes to avoid overwriting with stale data
  private localChangesSubject = new Subject<boolean>();
  public localChanges$ = this.localChangesSubject.asObservable();
  
  private unsubscribe: (() => void) | null = null;
  private currentUserId: string | null = null;
  private isInitialized = false;
  private pendingSave = false;

  /**
   * Initialize board data subscription for the current user
   * This listens to real-time changes in the board collection
   * Returns a promise that resolves when initial data is loaded
   */
  async initializeBoardSubscription(): Promise<BoardColumn[]> {
    const userId = this.auth.currentUser?.uid;
    
    // If already subscribed to same user, don't resubscribe
    if (this.currentUserId === userId && this.unsubscribe && this.isInitialized) {
      return this.boardSubject.value;
    }

    // Clean up old subscription if exists
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    if (!userId) {
      console.error('User not authenticated. Cannot initialize board subscription.');
      this.boardSubject.next([]);
      return [];
    }

    this.currentUserId = userId;
    this.isInitialized = false;
    
    // Use ordered query for consistent results
    const boardCollection = collection(this.firestore, `users/${userId}/board`);
    const boardQuery = query(boardCollection, orderBy('order', 'asc'));
    
    // Create a promise that will resolve when we get the first snapshot
    return new Promise((resolve) => {
      // Set a timeout to resolve even if no data (after 2 seconds)
      const timeoutId = setTimeout(() => {
        if (this.boardSubject.value.length === 0) {
          // No data received, resolve with empty to let caller handle default columns
          resolve([]);
        }
      }, 2000);

      this.unsubscribe = onSnapshot(
        boardQuery,
        (snapshot) => {
          // Clear the timeout since we got data
          clearTimeout(timeoutId);

          const columns: BoardColumn[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as Partial<BoardColumn> & { order?: number };
            columns.push({
              id: docSnap.id,
              title: data.title || '',
              statusLabel: data.statusLabel || '',
              accent: (data.accent || 'custom') as any,
              tasks: Array.isArray(data.tasks) ? data.tasks : [],
              isDefault: data.isDefault || false
            });
          });
          
          console.log('Firestore real-time update received:', columns.length, 'columns');
          this.boardSubject.next(columns);
          this.isInitialized = true;
          
          // Resolve the promise with the columns
          resolve(columns);
        },
        (error) => {
          console.error('Error subscribing to board:', error);
          clearTimeout(timeoutId);
          this.boardSubject.error(error);
          resolve([]); // Resolve with empty on error to allow fallback
        }
      );
    });
  }

  /**
   * Clean up subscription
   */
  unsubscribeFromBoard(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.currentUserId = null;
    this.isInitialized = false;
    this.pendingSave = false;
    this.boardSubject.next([]);
  }

  /**
   * Signal that local changes are being made
   * This prevents Firestore updates from overwriting local state
   */
  markLocalChanges(): void {
    this.pendingSave = true;
    this.localChangesSubject.next(true);
  }

  /**
   * Signal that local changes are complete
   * This re-enables Firestore real-time updates
   */
  clearLocalChanges(): void {
    this.pendingSave = false;
    this.localChangesSubject.next(false);
  }

  /**
   * Check if there are pending local changes
   */
  hasPendingChanges(): boolean {
    return this.pendingSave;
  }

  /**
   * Save entire board state to Firestore
   * Each column is stored as a document with its tasks array
   * This will delete any columns that were removed
   */
  async saveBoardData(columns: BoardColumn[]): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated. Please log in again.');
    }

    // Mark as pending to prevent race conditions
    this.pendingSave = true;

    try {
      const batch = writeBatch(this.firestore);
      const boardPath = `users/${userId}/board`;

      // First, get all existing column IDs to determine what to delete
      const boardCollection = collection(this.firestore, boardPath);
      const snapshot = await getDocs(boardCollection);
      const existingIds = new Set(snapshot.docs.map(d => d.id));
      const newIds = new Set(columns.map(c => c.id));

      // Delete columns that exist in Firestore but not in the new data
      existingIds.forEach(id => {
        if (!newIds.has(id)) {
          const columnRef = doc(this.firestore, boardPath, id);
          batch.delete(columnRef);
        }
      });

      // Write all columns (with their tasks arrays)
      columns.forEach((column, index) => {
        const columnRef = doc(this.firestore, boardPath, column.id);
        batch.set(columnRef, {
          id: column.id,
          title: column.title,
          statusLabel: column.statusLabel,
          accent: column.accent,
          isDefault: column.isDefault,
          tasks: column.tasks,
          order: index,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      console.log('Board saved to Firestore successfully');
    } catch (error: any) {
      console.error('Error saving to Firestore:', error);
      throw new Error(this.getFriendlyErrorMessage(error));
    } finally {
      // Clear pending state after a short delay to allow Firestore to update
      setTimeout(() => {
        this.pendingSave = false;
      }, 300);
    }
  }

  /**
   * Save a single column (with its tasks)
   */
  async saveColumn(column: BoardColumn, order: number = 0): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated. Please log in again.');
    }

    this.pendingSave = true;

    try {
      const columnRef = doc(this.firestore, `users/${userId}/board`, column.id);
      await setDoc(columnRef, {
        id: column.id,
        title: column.title,
        statusLabel: column.statusLabel,
        accent: column.accent,
        isDefault: column.isDefault,
        tasks: column.tasks,
        order: order,
        updatedAt: new Date().toISOString()
      });
      console.log('Column saved to Firestore:', column.id);
    } catch (error: any) {
      console.error('Error saving column to Firestore:', error);
      throw new Error(this.getFriendlyErrorMessage(error));
    } finally {
      setTimeout(() => {
        this.pendingSave = false;
      }, 300);
    }
  }

  /**
   * Delete a column
   */
  async deleteColumn(columnId: string): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) {
      throw new Error('User not authenticated. Please log in again.');
    }

    this.pendingSave = true;

    try {
      const columnRef = doc(this.firestore, `users/${userId}/board`, columnId);
      await deleteDoc(columnRef);
      console.log('Column deleted from Firestore:', columnId);
    } catch (error: any) {
      console.error('Error deleting column from Firestore:', error);
      throw new Error(this.getFriendlyErrorMessage(error));
    } finally {
      setTimeout(() => {
        this.pendingSave = false;
      }, 300);
    }
  }

  /**
   * Convert Firebase errors to user-friendly messages
   */
  private getFriendlyErrorMessage(error: any): string {
    if (!error) return 'An unknown error occurred.';
    
    const errorCode = error.code || error.message || '';
    
    if (errorCode.includes('permission-denied') || errorCode.includes('PERMISSION_DENIED')) {
      return 'Permission denied. Please check your account permissions.';
    }
    if (errorCode.includes('not-found') || errorCode.includes('NOT_FOUND')) {
      return 'Data not found. Please refresh the page.';
    }
    if (errorCode.includes('network') || errorCode.includes('NETWORK')) {
      return 'Network error. Please check your internet connection.';
    }
    if (errorCode.includes('quota') || errorCode.includes('QUOTA')) {
      return 'Storage quota exceeded. Please delete some data.';
    }
    if (errorCode.includes('unavailable')) {
      return 'Service temporarily unavailable. Please try again later.';
    }
    
    // Return original message if it's user-friendly
    if (typeof error.message === 'string' && error.message.length < 100) {
      return error.message;
    }
    
    return 'An error occurred while saving your data. Please try again.';
  }
}
