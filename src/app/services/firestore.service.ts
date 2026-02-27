import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, onSnapshot, deleteDoc, writeBatch } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, BehaviorSubject } from 'rxjs';

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
  private unsubscribe: (() => void) | null = null;
  private currentUserId: string | null = null;

  /**
   * Initialize board data subscription for the current user
   * This listens to real-time changes in the board collection
   */
  initializeBoardSubscription(): Observable<BoardColumn[]> {
    const userId = this.auth.currentUser?.uid;
    
    // If already subscribed to same user, don't resubscribe
    if (this.currentUserId === userId && this.unsubscribe) {
      return this.board$;
    }

    // Clean up old subscription if exists
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    if (!userId) {
      console.error('User not authenticated. Cannot initialize board subscription.');
      this.boardSubject.next([]);
      return this.board$;
    }

    this.currentUserId = userId;
    const boardCollection = collection(this.firestore, `users/${userId}/board`);
    
    this.unsubscribe = onSnapshot(
      boardCollection,
      (snapshot) => {
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
        // Sort by order field if available
        columns.sort((a, b) => {
          const aOrder = (a as any).order ?? 0;
          const bOrder = (b as any).order ?? 0;
          return aOrder - bOrder;
        });
        this.boardSubject.next(columns);
      },
      (error) => {
        console.error('Error subscribing to board:', error);
      }
    );

    return this.board$;
  }

  /**
   * Clean up subscription
   */
  unsubscribeFromBoard(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
      this.currentUserId = null;
      this.boardSubject.next([]);
    }
  }

  /**
   * Save entire board state to Firestore
   * Each column is stored as a document with its tasks array
   */
  async saveBoardData(columns: BoardColumn[]): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const batch = writeBatch(this.firestore);
    const boardPath = `users/${userId}/board`;

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
  }

  /**
   * Save a single column (with its tasks)
   */
  async saveColumn(column: BoardColumn, order: number = 0): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

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
  }

  /**
   * Delete a column
   */
  async deleteColumn(columnId: string): Promise<void> {
    const userId = this.auth.currentUser?.uid;
    if (!userId) throw new Error('User not authenticated');

    const columnRef = doc(this.firestore, `users/${userId}/board`, columnId);
    await deleteDoc(columnRef);
  }
}
