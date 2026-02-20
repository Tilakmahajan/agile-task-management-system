import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import toastr from 'toastr';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  statusLabel: string;
}

type PriorityFilter = 'All' | 'High' | 'Medium' | 'Low';
type SortMode = 'manual' | 'priorityHigh' | 'priorityLow' | 'dueSoon' | 'dueLate' | 'title';
type ColumnAccent = 'todo' | 'progress' | 'done' | 'custom';

interface BoardColumn {
  id: string;
  title: string;
  statusLabel: string;
  accent: ColumnAccent;
  tasks: Task[];
  isDefault: boolean;
}

interface PersistedBoard {
  columns: BoardColumn[];
}

const STORAGE_KEY = 'agile-task-board';

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-board.html',
  styleUrl: './task-board.css',
})
export class TaskBoard implements OnInit {
  columns: BoardColumn[] = [];

  priorityFilter: PriorityFilter = 'All';
  sortMode: SortMode = 'manual';

  showTaskForm = false;
  isEditMode = false;
  addToColumnId = 'todo';
  editContext: { columnId: string; index: number } | null = null;

  // Delete confirmation dialog
  showDeleteConfirm = false;
  deleteContext: { columnId: string; taskId: string; taskTitle: string } | null = null;

  // Column removal confirmation dialog
  showRemoveColumnConfirm = false;
  removeColumnContext: { columnId: string; columnTitle: string; taskCount: number } | null = null;

  formTask: Task = this.createEmptyTask();
  newColumnTitle = '';

  private dragSource: { columnId: string; taskId: string } | null = null;
  draggingTaskId: string | null = null;
  dropTargetTaskId: string | null = null;
  dropTargetPlacement: 'before' | 'after' | null = null;
  dropTargetColumnId: string | null = null;

  ngOnInit(): void {
    this.loadFromStorage();
    this.configureToastr();
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

  get openTasksCount(): number {
    return this.getFilteredTasksById('todo').length;
  }

  get inProgressTasksCount(): number {
    return this.getFilteredTasksById('inProgress').length;
  }

  get doneTasksCount(): number {
    return this.getFilteredTasksById('done').length;
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
    return this.sortTasks(this.filterByPriority(column.tasks));
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

  saveTask(): void {
    const t = this.formTask;
    if (!t.title?.trim()) return;

    if (this.isEditMode && this.editContext) {
      const arr = this.getColumnTasks(this.editContext.columnId);
      arr[this.editContext.index] = { ...t, title: t.title.trim(), description: t.description?.trim() ?? '' };
    } else {
      const targetColumn = this.getColumnById(this.addToColumnId);
      if (!targetColumn) return;

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
  }

  cancelForm(): void {
    this.showTaskForm = false;
    this.isEditMode = false;
    this.editContext = null;
    this.formTask = this.createEmptyTask();
  }

  // Task delete confirmation methods
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

  executeDelete(): void {
    if (!this.deleteContext) return;
    
    const { columnId, taskId } = this.deleteContext;
    const arr = this.getColumnTasks(columnId);
    const index = arr.findIndex((task) => task.id === taskId);
    
    if (index >= 0) {
      arr.splice(index, 1);
      this.saveToStorage();
      (toastr as any).warning('Task has been deleted!', 'Alert');
    }
    
    this.showDeleteConfirm = false;
    this.deleteContext = null;
  }

  deleteTaskById(columnId: string, taskId: string): void {
    const arr = this.getColumnTasks(columnId);
    const index = arr.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      arr.splice(index, 1);
      this.saveToStorage();
      (toastr as any).warning('Task has been deleted!', 'Alert');
    }
  }

  // Column removal confirmation methods
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

  addColumn(): void {
    const title = this.newColumnTitle.trim();
    if (!title) return;

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
  }

  removeColumn(columnId: string): void {
    this.confirmRemoveColumn(columnId, new Event('click'));
  }

  private performRemoveColumn(columnId: string): void {
    if (this.columns.length <= 1) return;

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

  onColumnDragOver(columnId: string, event: DragEvent): void {
    this.onDragOver(event);
    this.dropTargetColumnId = columnId;
  }

  onTaskDragOver(taskId: string, event: DragEvent): void {
    this.onDragOver(event);
    this.dropTargetTaskId = taskId;
    this.dropTargetPlacement = this.shouldPlaceAfterTarget(event) ? 'after' : 'before';
  }

  onDrop(targetColumnId: string, event: DragEvent): void {
    event.preventDefault();
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

    this.saveToStorage();
    this.clearDragState();
  }

  onDropOnTask(targetColumnId: string, targetTaskId: string, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.dragSource) return;

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

    this.saveToStorage();
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
      const raw = localStorage.getItem(STORAGE_KEY);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ columns: this.columns }));
    } catch {
      // ignore storage issues
    }
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
  }
}
