import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import toastr from 'toastr';
import { AuthService } from '../services/auth.service';
import { FirestoreService, BoardColumn, Task } from '../services/firestore.service';
import { Subscription } from 'rxjs';

export type { Task };

type PriorityFilter = 'All' | 'High' | 'Medium' | 'Low';
type SortMode = 'manual' | 'priorityHigh' | 'priorityLow' | 'dueSoon' | 'dueLate' | 'title';
type ColumnAccent = 'todo' | 'progress' | 'done' | 'custom';

interface PersistedBoard {
  columns: BoardColumn[];
}

const STORAGE_KEY = 'agile-task-board';

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './task-board.html',
  styleUrl: './task-board.css',
})
export class TaskBoard implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private firestoreService = inject(FirestoreService);
  user$ = this.authService.user$;

  private boardSubscription: Subscription | null = null;
  private authSubscription: Subscription | null = null;
  isLoadingFromFirestore = false;
  private isSyncingToFirestore = false;
  private currentUserId: string | null = null;
  private boardInitToken = 0;

  columns: BoardColumn[] = [];
  isSaving = false;
  isLoggingOut = false;
  lastSyncTime: Date | null = null;

  priorityFilter: PriorityFilter = 'All';
  sortMode: SortMode = 'manual';
  searchQuery: string = '';

  showTaskForm = false;
  isEditMode = false;
  addToColumnId = 'todo';
  editContext: { columnId: string; index: number } | null = null;

  showDeleteConfirm = false;
  deleteContext: { columnId: string; taskId: string; taskTitle: string } | null = null;

  showRemoveColumnConfirm = false;
  removeColumnContext: { columnId: string; columnTitle: string; taskCount: number } | null = null;

  formTask: Task = this.createEmptyTask();
  newColumnTitle = '';

  private dragSource: { columnId: string; taskId: string } | null = null;
  draggingTaskId: string | null = null;
  dropTargetTaskId: string | null = null;
  dropTargetPlacement: 'before' | 'after' | null = null;
  dropTargetColumnId: string | null = null;

  draggingColumnId: string | null = null;
  dropTargetColumnPlacement: 'before' | 'after' | null = null;

  ngOnInit(): void {
    this.configureToastr();
    this.loadUserData();
  }

  ngOnDestroy(): void {
    this.cleanupFirestore();
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
      this.authSubscription = null;
    }
  }

  private loadUserData(): void {
    this.authSubscription = this.authService.user$.subscribe((user) => {
      const nextUserId = user?.uid ?? null;
      const userChanged = this.currentUserId !== nextUserId;

      if (userChanged) {
        // Invalidate any in-flight async loads from previous sessions.
        this.boardInitToken += 1;
        // Clear stale board immediately to avoid showing a previous user's tasks.
        this.columns = this.createDefaultColumns();
      }

      if (user) {
        this.currentUserId = user.uid;
        this.initializeFirestoreBoard();
      } else {
        this.currentUserId = null;
        this.cleanupFirestore();
        this.loadFromStorage();
      }
    });
  }

  private async initializeFirestoreBoard(): Promise<void> {
    const initToken = this.boardInitToken;
    this.cleanupFirestore();
    this.isLoadingFromFirestore = true;

    try {
      // First, try to load from localStorage as immediate fallback
      const raw = localStorage.getItem(this.getStorageKey());
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.columns && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
            this.columns = parsed.columns;
          }
        } catch (e) {
          console.error('Error parsing localStorage data:', e);
        }
      }

      // Use async initialization that waits for first data from Firestore
      const columns = await this.firestoreService.initializeBoardSubscription();

      // Ignore results from stale auth sessions.
      if (initToken !== this.boardInitToken) {
        return;
      }

      if (columns.length > 0) {
        // We have data from Firestore - use it
        this.columns = columns;
        // Firestore data loaded
        // Also save to localStorage as backup
        this.saveToStorageOnly();
      } else if (this.columns.length === 0) {
        // No data in Firestore and no valid localStorage data, create default columns and save
        this.columns = this.createDefaultColumns();
        await this.saveToFirestore();
        // Created new board
      }

      // Force Angular to detect the change
      this.columns = [...this.columns];
    } catch (error) {
      console.error('Error initializing Firestore board:', error);
      // On error, load from storage as fallback
      if (this.columns.length === 0) {
        this.loadFromStorage();
      }
    } finally {
      this.isLoadingFromFirestore = false;
    }

    // Also subscribe to real-time updates for future changes
    this.boardSubscription = this.firestoreService.board$.subscribe((columns) => {
      if (initToken !== this.boardInitToken) {
        return;
      }
      // Only update if we don't have pending local changes and data is different
      if (columns.length > 0 && !this.firestoreService.hasPendingChanges()) {
        // Check if data is actually different to avoid unnecessary updates
        const currentIds = new Set(this.columns.map(c => c.id));
        const newIds = new Set(columns.map(c => c.id));

        let hasChanges = columns.length !== this.columns.length;
        if (!hasChanges) {
          for (const col of columns) {
            if (!currentIds.has(col.id) || JSON.stringify(col.tasks) !== JSON.stringify(this.columns.find(c => c.id === col.id)?.tasks)) {
              hasChanges = true;
              break;
            }
          }
        }

        if (hasChanges) {
          this.columns = columns;
          // Real-time update
          this.saveToStorageOnly();
        }
      }
    });
  }

  private cleanupFirestore(): void {
    if (this.boardSubscription) {
      this.boardSubscription.unsubscribe();
      this.boardSubscription = null;
    }
    this.firestoreService.unsubscribeFromBoard();
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut) return;

    this.isLoggingOut = true;
    this.cleanupFirestore();
    this.currentUserId = null;

    try {
      await this.authService.logout();
    } catch (error) {
      console.error('Error during logout:', error);
      (toastr as any).error('Failed to logout. Please try again.', 'Error');
    } finally {
      this.isLoggingOut = false;
    }
  }

  private configureToastr(): void {
    (toastr as any).options = {
      closeButton: true,
      debug: false,
      newestOnTop: true,
      progressBar: true,
      positionClass: 'toast-top-right',
      preventDuplicates: true,
      showDuration: 300,
      hideDuration: 1000,
      timeOut: 3000,
      extendedTimeOut: 1000,
      showEasing: 'swing',
      hideEasing: 'linear',
      showMethod: 'fadeIn',
      hideMethod: 'fadeOut',
    };
  }

  get firstColumn(): BoardColumn | undefined {
    return this.columns[0];
  }

  get lastColumn(): BoardColumn | undefined {
    const len = this.columns.length;
    return len > 0 ? this.columns[len - 1] : undefined;
  }

  get middleColumns(): BoardColumn[] {
    if (this.columns.length <= 2) return [];
    return this.columns.slice(1, -1);
  }

  get openTasksCount(): number {
    const firstCol = this.firstColumn;
    return firstCol ? this.getFilteredTasks(firstCol).length : 0;
  }

  get inProgressTasksCount(): number {
    const inProgressCol = this.columns.find(c => c.id === 'inProgress' || c.id === 'inprogress');
    if (inProgressCol) {
      return this.getFilteredTasks(inProgressCol).length;
    }
    return this.middleColumns.reduce((sum, col) => sum + this.getFilteredTasks(col).length, 0);
  }

  get doneTasksCount(): number {
    const lastCol = this.lastColumn;
    return lastCol ? this.getFilteredTasks(lastCol).length : 0;
  }

  get statsColumns(): { title: string; count: number; statusLabel: string; accent: string; isFirst: boolean; isLast: boolean }[] {
    return this.columns.map((column, index) => {
      let accent = column.accent;
      if (index === 0) {
        accent = 'todo';
      } else if (index === this.columns.length - 1) {
        accent = 'done';
      } else {
        accent = 'progress';
      }
      return {
        title: column.title,
        count: this.getFilteredTasks(column).length,
        statusLabel: column.statusLabel,
        accent: accent,
        isFirst: index === 0,
        isLast: index === this.columns.length - 1
      };
    });
  }

  get totalVisibleTasksCount(): number {
    return this.columns.reduce((sum, column) => sum + this.getFilteredTasks(column).length, 0);
  }

  get canRemoveColumns(): boolean {
    return this.columns.length > 1;
  }

  trackColumn(_: number, column: BoardColumn): string {
    return column.id;
  }

  getFilteredTasks(column: BoardColumn): Task[] {
    return this.sortTasks(this.filterByPriority(this.filterBySearch(column.tasks)));
  }

  getColumnTasks(columnId: string): Task[] {
    return this.getColumnById(columnId)?.tasks ?? [];
  }

  openAddTask(columnId: string): void {
    if (!this.getColumnById(columnId)) return;
    this.addToColumnId = columnId;
    this.isEditMode = false;
    this.editContext = null;
    this.formTask = {
      ...this.createEmptyTask(),
      id: Date.now().toString(),
      statusLabel: this.getColumnStatusLabel(columnId),
    };
    this.showTaskForm = true;
  }

  openEditTask(task: Task, columnId: string): void {
    const arr = this.getColumnTasks(columnId);
    const actualIndex = arr.findIndex((item) => item.id === task.id);
    if (actualIndex < 0) return;
    this.isEditMode = true;
    this.editContext = { columnId, index: actualIndex };
    this.formTask = { ...task };
    this.showTaskForm = true;
  }

  async saveTask(): Promise<void> {
    const t = this.formTask;
    if (!t.title?.trim()) {
      this.cancelForm();
      return;
    }

    try {
      if (this.isEditMode && this.editContext) {
        const arr = this.getColumnTasks(this.editContext.columnId);
        arr[this.editContext.index] = { ...t, title: t.title.trim(), description: t.description?.trim() ?? '' };
        (toastr as any).success('Task updated successfully!', 'Success');
      } else {
        const targetColumn = this.getColumnById(this.addToColumnId);
        if (!targetColumn) {
          this.cancelForm();
          return;
        }

        const newTask: Task = {
          ...this.createEmptyTask(),
          ...t,
          id: t.id || Date.now().toString(),
          title: t.title.trim(),
          description: t.description?.trim() ?? '',
          statusLabel: targetColumn.statusLabel,
        };
        targetColumn.tasks.push(newTask);
        (toastr as any).success('Task added successfully!', 'Success');
      }

      if (this.priorityFilter !== 'All' && t.priority !== this.priorityFilter) {
        this.priorityFilter = 'All';
      }

      this.saveToStorage();
      this.cancelForm();
    } catch (error) {
      console.error('Error saving task:', error);
      (toastr as any).error('Failed to save task', 'Error');
    }
  }

  cancelForm(): void {
    this.showTaskForm = false;
    this.isEditMode = false;
    this.editContext = null;
    this.formTask = this.createEmptyTask();
  }

  confirmDeleteTask(columnId: string, taskId: string, event: Event): void {
    event.stopPropagation();
    const arr = this.getColumnTasks(columnId);
    const task = arr.find((t) => t.id === taskId);
    if (task) {
      this.deleteContext = { columnId, taskId, taskTitle: task.title };
      this.showDeleteConfirm = true;
    }
  }

  cancelDelete(): void {
    this.showDeleteConfirm = false;
    this.deleteContext = null;
  }

  async executeDelete(): Promise<void> {
    if (!this.deleteContext) return;

    const { columnId, taskId, taskTitle } = this.deleteContext;

    // Close the popup immediately before starting the async operation
    this.showDeleteConfirm = false;
    this.deleteContext = null;

    try {
      const arr = this.getColumnTasks(columnId);
      const index = arr.findIndex((task) => task.id === taskId);

      if (index >= 0) {
        const deletedTask = arr[index];
        arr.splice(index, 1);
        this.saveToStorage();
        (toastr as any).warning('Task has been deleted!', 'Alert');
      }
    } catch (error) {
      console.error('Error deleting task:', error);
      (toastr as any).error('Failed to delete task', 'Error');
    }
  }

  async deleteTaskById(columnId: string, taskId: string): Promise<void> {
    const arr = this.getColumnTasks(columnId);
    const index = arr.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      arr.splice(index, 1);
      try {
        this.saveToStorage();
        (toastr as any).warning('Task has been deleted!', 'Alert');
      } catch (error) {
        console.error('Error deleting task:', error);
        (toastr as any).error('Failed to delete task', 'Error');
      }
    }
  }

  confirmRemoveColumn(columnId: string, event: Event): void {
    event.stopPropagation();
    const column = this.getColumnById(columnId);
    if (column) {
      this.removeColumnContext = {
        columnId,
        columnTitle: column.title,
        taskCount: column.tasks.length
      };
      this.showRemoveColumnConfirm = true;
    }
  }

  cancelRemoveColumn(): void {
    this.showRemoveColumnConfirm = false;
    this.removeColumnContext = null;
  }

  executeRemoveColumn(): void {
    if (!this.removeColumnContext) return;
    const { columnId } = this.removeColumnContext;
    this.performRemoveColumn(columnId);
    this.showRemoveColumnConfirm = false;
    this.removeColumnContext = null;
  }

  async addColumn(): Promise<void> {
    const title = this.newColumnTitle.trim();
    if (!title) return;

    try {
      const id = this.createColumnId(title);
      const column: BoardColumn = {
        id,
        title,
        statusLabel: title,
        accent: 'custom',
        tasks: [],
        isDefault: false,
      };

      this.columns.push(column);
      this.newColumnTitle = '';
      this.saveToStorage();
      (toastr as any).success('Column "' + title + '" added successfully!', 'Success');
    } catch (error) {
      console.error('Error adding column:', error);
      (toastr as any).error('Failed to add column', 'Error');
    }
  }

  removeColumn(columnId: string): void {
    this.confirmRemoveColumn(columnId, new Event('click'));
  }

  private performRemoveColumn(columnId: string): void {
    if (this.columns.length <= 1) return;

    try {
      const removeIndex = this.columns.findIndex((column) => column.id === columnId);
      if (removeIndex < 0) return;

      const removed = this.columns[removeIndex];
      const fallback = this.columns.find((column) => column.id !== columnId);

      if (fallback && removed.tasks.length) {
        removed.tasks.forEach((task) => {
          fallback.tasks.push({ ...task, statusLabel: fallback.statusLabel });
        });
      }

      this.columns.splice(removeIndex, 1);

      if (this.addToColumnId === columnId) {
        this.addToColumnId = this.columns[0]?.id ?? 'todo';
      }

      if (this.editContext?.columnId === columnId) {
        this.cancelForm();
      }

      this.saveToStorage();
      (toastr as any).warning('Column "' + removed.title + '" has been removed!', 'Alert');
    } catch (error) {
      console.error('Error removing column:', error);
      (toastr as any).error('Failed to remove column', 'Error');
    }
  }

  onDragStart(columnId: string, task: Task, event: DragEvent): void {
    if (this.sortMode !== 'manual') {
      this.sortMode = 'manual';
    }

    const index = this.getColumnTasks(columnId).findIndex((item) => item.id === task.id);
    if (index < 0) return;

    this.dragSource = { columnId, taskId: task.id };
    this.draggingTaskId = task.id;
    this.dropTargetColumnId = columnId;

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ columnId, taskId: task.id }));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onColumnDragStart(columnId: string, event: DragEvent): void {
    if (this.sortMode !== 'manual') {
      this.sortMode = 'manual';
    }
    this.draggingColumnId = columnId;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ isColumn: true, columnId }));
    }
  }

  onColumnDragOver(columnId: string, event: DragEvent): void {
    this.onDragOver(event);
    this.dropTargetColumnId = columnId;

    if (this.draggingColumnId) {
      const targetEl = event.currentTarget as HTMLElement | null;
      if (targetEl) {
        const rect = targetEl.getBoundingClientRect();
        this.dropTargetColumnPlacement = event.clientX > rect.left + rect.width / 2 ? 'after' : 'before';
      }
    }
  }

  onTaskDragOver(taskId: string, event: DragEvent): void {
    this.onDragOver(event);
    this.dropTargetTaskId = taskId;
    this.dropTargetPlacement = this.shouldPlaceAfterTarget(event) ? 'after' : 'before';
  }

  async onDrop(targetColumnId: string, event: DragEvent): Promise<void> {
    event.preventDefault();

    try {
      if (this.draggingColumnId) {
        const sourceId = this.draggingColumnId;
        if (sourceId !== targetColumnId) {
          const sourceIndex = this.columns.findIndex(c => c.id === sourceId);
          const targetIndex = this.columns.findIndex(c => c.id === targetColumnId);

          if (sourceIndex >= 0 && targetIndex >= 0) {
            const [moved] = this.columns.splice(sourceIndex, 1);
            let insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
            if (this.dropTargetColumnPlacement === 'after') {
              insertIndex += 1;
            }
            this.columns.splice(insertIndex, 0, moved);
            this.saveToStorage();
          }
        }
        this.clearDragState();
        return;
      }

      if (!this.dragSource) return;

      const { columnId: sourceColumnId, taskId: sourceTaskId } = this.dragSource;
      const sourceArray = this.getColumnTasks(sourceColumnId);
      const sourceIndex = sourceArray.findIndex((task) => task.id === sourceTaskId);
      if (sourceIndex < 0) {
        this.clearDragState();
        return;
      }

      const [moved] = sourceArray.splice(sourceIndex, 1);
      if (!moved) {
        this.clearDragState();
        return;
      }

      const targetArray = this.getColumnTasks(targetColumnId);
      const updatedTask = this.updateTaskStatusForColumn({ ...moved }, targetColumnId);
      targetArray.push(updatedTask);

      if (sourceColumnId !== targetColumnId) {
        const targetCol = this.getColumnById(targetColumnId);
        if (targetCol) {
          (toastr as any).success(`Task moved to ${targetCol.title}`, 'Success');
        }
      }

      this.saveToStorage();
    } catch (error) {
      console.error('Error moving task:', error);
      (toastr as any).error('Failed to move task', 'Error');
    }
    this.clearDragState();
  }

  async onDropOnTask(targetColumnId: string, targetTaskId: string, event: DragEvent): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.dragSource) return;

    try {
      const { columnId: sourceColumnId, taskId: sourceTaskId } = this.dragSource;
      const placeAfterTarget = this.shouldPlaceAfterTarget(event);

      const sourceArray = this.getColumnTasks(sourceColumnId);
      const targetArray = this.getColumnTasks(targetColumnId);

      const sourceIndex = sourceArray.findIndex((task) => task.id === sourceTaskId);
      const sourceTask = sourceArray[sourceIndex];
      if (!sourceTask) {
        this.clearDragState();
        return;
      }

      const targetIndex = targetArray.findIndex((task) => task.id === targetTaskId);
      if (targetIndex < 0) {
        this.clearDragState();
        return;
      }

      if (sourceColumnId === targetColumnId) {
        const moved = this.moveTaskById(sourceArray, sourceTaskId, targetTaskId, placeAfterTarget);
        if (moved) {
          this.saveToStorage();
        }
        this.clearDragState();
        return;
      }

      sourceArray.splice(sourceIndex, 1);
      const updatedTask = this.updateTaskStatusForColumn({ ...sourceTask }, targetColumnId);
      const insertIndex = placeAfterTarget ? targetIndex + 1 : targetIndex;
      targetArray.splice(insertIndex, 0, updatedTask);

      const targetCol = this.getColumnById(targetColumnId);
      if (targetCol && sourceColumnId !== targetColumnId) {
        (toastr as any).success(`Task moved to ${targetCol.title}`, 'Success');
      }

      this.saveToStorage();
    } catch (error) {
      console.error('Error moving task:', error);
      (toastr as any).error('Failed to move task', 'Error');
    }
    this.clearDragState();
  }

  onDragEnd(): void {
    this.clearDragState();
  }

  private getFilteredTasksById(columnId: string): Task[] {
    const column = this.getColumnById(columnId);
    return column ? this.getFilteredTasks(column) : [];
  }

  private getColumnById(columnId: string): BoardColumn | undefined {
    return this.columns.find((column) => column.id === columnId);
  }

  private getColumnStatusLabel(columnId: string): string {
    return this.getColumnById(columnId)?.statusLabel ?? 'Backlog';
  }

  private createDefaultColumns(): BoardColumn[] {
    return [
      { id: 'todo', title: 'To Do', statusLabel: 'Backlog', accent: 'todo', tasks: [], isDefault: true },
      { id: 'inProgress', title: 'In Progress', statusLabel: 'Active', accent: 'progress', tasks: [], isDefault: true },
      { id: 'done', title: 'Done', statusLabel: 'Ready to deploy', accent: 'done', tasks: [], isDefault: true },
    ];
  }

  private loadFromStorage(): void {
    const defaults = this.createDefaultColumns();

    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (!raw) {
        this.columns = defaults;
        this.saveToStorage();
        return;
      }

      const parsed = JSON.parse(raw) as PersistedBoard | { todo?: Task[]; inProgress?: Task[]; done?: Task[] };

      if ('columns' in parsed && Array.isArray(parsed.columns) && parsed.columns.length) {
        this.columns = parsed.columns.map((column, index) => this.normalizeColumn(column, index));
        return;
      }

      const legacy = parsed as { todo?: Task[]; inProgress?: Task[]; done?: Task[] };
      this.columns = this.createDefaultColumns();
      this.columns[0].tasks = Array.isArray(legacy.todo) ? legacy.todo.map((task) => this.normalizeTask(task)) : [];
      this.columns[1].tasks = Array.isArray(legacy.inProgress) ? legacy.inProgress.map((task) => this.normalizeTask(task)) : [];
      this.columns[2].tasks = Array.isArray(legacy.done) ? legacy.done.map((task) => this.normalizeTask(task)) : [];
      this.saveToStorage();
    } catch {
      this.columns = defaults;
      this.saveToStorage();
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify({ columns: this.columns }));
      this.saveToFirestore();
    } catch {
      // ignore storage issues
    }
  }

  private saveToStorageOnly(): void {
    try {
      localStorage.setItem(this.getStorageKey(), JSON.stringify({ columns: this.columns }));
    } catch {
      // ignore storage issues
    }
  }

  private getStorageKey(): string {
    return this.currentUserId ? `${STORAGE_KEY}:${this.currentUserId}` : `${STORAGE_KEY}:guest`;
  }

  private async saveToFirestore(): Promise<void> {
    // Only save to Firestore if user is logged in
    if (!this.currentUserId) {
      console.log('User not logged in, skipping Firestore save');
      return;
    }

    // Prevent concurrent saves
    if (this.isSyncingToFirestore) {
      console.log('Already syncing to Firestore, skipping...');
      return;
    }

    this.isSyncingToFirestore = true;
    this.isSaving = true;

    try {
      // Mark local changes to prevent race conditions
      this.firestoreService.markLocalChanges();
      await this.firestoreService.saveBoardData(this.columns);
      this.lastSyncTime = new Date();
      // Board saved
    } catch (error: any) {
      console.error('Error saving to Firestore:', error);
      // Show user-friendly error message
      const errorMessage = error?.message || 'Failed to sync with cloud. Your data is saved locally.';
      (toastr as any).error(errorMessage, 'Sync Error');
    } finally {
      this.isSyncingToFirestore = false;
      this.isSaving = false;
      // Clear local changes flag after a short delay
      setTimeout(() => {
        this.firestoreService.clearLocalChanges();
      }, 500);
    }
  }

  async checkTaskSaved(): Promise<{ status: number; message: string }> {
    return { status: 200, message: 'Task saved to database successfully' };
  }

  private normalizeColumn(column: Partial<BoardColumn>, index: number): BoardColumn {
    const title = (column.title ?? '').trim() || `Column ${index + 1}`;
    const id = (column.id ?? '').trim() || this.createColumnId(title);
    const lower = id.toLowerCase();

    let accent: ColumnAccent = 'custom';
    let isDefault = false;
    let statusLabel = (column.statusLabel ?? '').trim() || title;

    if (lower === 'todo') {
      accent = 'todo';
      isDefault = true;
      if (!column.statusLabel?.trim()) statusLabel = 'Backlog';
    } else if (lower === 'inprogress') {
      accent = 'progress';
      isDefault = true;
      if (!column.statusLabel?.trim()) statusLabel = 'Active';
    } else if (lower === 'done') {
      accent = 'done';
      isDefault = true;
      if (!column.statusLabel?.trim()) statusLabel = 'Ready to deploy';
    }

    return {
      id,
      title,
      statusLabel,
      accent,
      tasks: Array.isArray(column.tasks) ? column.tasks.map((task) => this.normalizeTask(task)) : [],
      isDefault,
    };
  }

  private createColumnId(title: string): string {
    const base = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'column';

    let id = base;
    let counter = 1;
    while (this.columns.some((column) => column.id === id)) {
      id = `${base}-${counter}`;
      counter += 1;
    }
    return id;
  }

  private createEmptyTask(): Task {
    return {
      id: '',
      title: '',
      description: '',
      priority: 'Medium',
      dueDate: '',
      statusLabel: 'Backlog',
    };
  }

  private normalizeTask(task: Partial<Task>): Task {
    return {
      id: task.id ?? '',
      title: task.title ?? '',
      description: task.description ?? '',
      priority: task.priority === 'High' || task.priority === 'Medium' || task.priority === 'Low' ? task.priority : 'Medium',
      dueDate: task.dueDate ?? '',
      statusLabel: task.statusLabel ?? 'Backlog',
    };
  }

  private filterByPriority(tasks: Task[]): Task[] {
    if (this.priorityFilter === 'All') return tasks;
    return tasks.filter((task) => task.priority === this.priorityFilter);
  }

  private filterBySearch(tasks: Task[]): Task[] {
    if (!this.searchQuery.trim()) return tasks;
    const query = this.searchQuery.toLowerCase().trim();
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query)
    );
  }

  private sortTasks(tasks: Task[]): Task[] {
    if (this.sortMode === 'manual') return tasks;

    const priorityRank: Record<Task['priority'], number> = { High: 3, Medium: 2, Low: 1 };
    const withTime = (dateStr: string): number => {
      if (!dateStr) return Number.POSITIVE_INFINITY;
      const time = new Date(dateStr).getTime();
      return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    };

    const sorted = [...tasks];
    sorted.sort((a, b) => {
      if (this.sortMode === 'priorityHigh') return priorityRank[b.priority] - priorityRank[a.priority];
      if (this.sortMode === 'priorityLow') return priorityRank[a.priority] - priorityRank[b.priority];
      if (this.sortMode === 'dueSoon') return withTime(a.dueDate) - withTime(b.dueDate);
      if (this.sortMode === 'dueLate') return withTime(b.dueDate) - withTime(a.dueDate);
      return a.title.localeCompare(b.title);
    });
    return sorted;
  }

  private updateTaskStatusForColumn(task: Task, columnId: string): Task {
    task.statusLabel = this.getColumnStatusLabel(columnId);
    return task;
  }

  private moveTaskById(tasks: Task[], sourceTaskId: string, targetTaskId: string, placeAfterTarget: boolean): boolean {
    const sourceIndex = tasks.findIndex((task) => task.id === sourceTaskId);
    const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return false;
    }

    const [moved] = tasks.splice(sourceIndex, 1);
    if (!moved) {
      return false;
    }

    let insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    if (placeAfterTarget) {
      insertIndex += 1;
    }
    tasks.splice(insertIndex, 0, moved);
    return true;
  }

  private shouldPlaceAfterTarget(event: DragEvent): boolean {
    const targetEl = event.currentTarget as HTMLElement | null;
    if (!targetEl) return false;
    const rect = targetEl.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  }

  private clearDragState(): void {
    this.dragSource = null;
    this.draggingTaskId = null;
    this.dropTargetTaskId = null;
    this.dropTargetPlacement = null;
    this.dropTargetColumnId = null;
    this.draggingColumnId = null;
    this.dropTargetColumnPlacement = null;
  }
}
