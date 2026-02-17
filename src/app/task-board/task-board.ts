import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type ColumnId = 'todo' | 'inProgress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  statusLabel: string;
}

const STORAGE_KEY = 'agile-task-board';

const DEFAULT_TODO: Task[] = [


];
const DEFAULT_IN_PROGRESS: Task[] = [

];
const DEFAULT_DONE: Task[] = [

];

@Component({
  selector: 'app-task-board',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-board.html',
  styleUrl: './task-board.css',
})
export class TaskBoard implements OnInit {
  todoTasks: Task[] = [];
  inProgressTasks: Task[] = [];
  doneTasks: Task[] = [];
  priorityFilter: 'All' | 'High' | 'Medium' | 'Low' = 'All';

  showTaskForm = false;
  isEditMode = false;
  addToColumn: ColumnId = 'todo';
  editContext: { column: ColumnId; index: number } | null = null;

  formTask: Task = this.createEmptyTask();

  private dragSource: { column: ColumnId; index: number; taskId: string } | null = null;

  ngOnInit(): void {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { todo: Task[]; inProgress: Task[]; done: Task[] };
        if (Array.isArray(data.todo)) this.todoTasks = data.todo.map((task) => this.normalizeTask(task));
        if (Array.isArray(data.inProgress)) this.inProgressTasks = data.inProgress.map((task) => this.normalizeTask(task));
        if (Array.isArray(data.done)) this.doneTasks = data.done.map((task) => this.normalizeTask(task));
        if (this.todoTasks.length || this.inProgressTasks.length || this.doneTasks.length) {
          return;
        }
      }
    } catch {
      // invalid or missing – use defaults
    }
    this.todoTasks = DEFAULT_TODO.map((t) => this.normalizeTask(t));
    this.inProgressTasks = DEFAULT_IN_PROGRESS.map((t) => this.normalizeTask(t));
    this.doneTasks = DEFAULT_DONE.map((t) => this.normalizeTask(t));
    this.saveToStorage();
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          todo: this.todoTasks,
          inProgress: this.inProgressTasks,
          done: this.doneTasks,
        })
      );
    } catch {
      // ignore quota or other errors
    }
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

  get filteredTodoTasks(): Task[] {
    return this.filterByPriority(this.todoTasks);
  }

  get filteredInProgressTasks(): Task[] {
    return this.filterByPriority(this.inProgressTasks);
  }

  get filteredDoneTasks(): Task[] {
    return this.filterByPriority(this.doneTasks);
  }

  get openTasksCount(): number {
    return this.filteredTodoTasks.length;
  }

  get inProgressTasksCount(): number {
    return this.filteredInProgressTasks.length;
  }

  get doneTasksCount(): number {
    return this.filteredDoneTasks.length;
  }

  get totalVisibleTasksCount(): number {
    return this.openTasksCount + this.inProgressTasksCount + this.doneTasksCount;
  }

  private filterByPriority(tasks: Task[]): Task[] {
    if (this.priorityFilter === 'All') return tasks;
    return tasks.filter((task) => task.priority === this.priorityFilter);
  }

  getColumnTasks(column: ColumnId): Task[] {
    if (column === 'todo') return this.todoTasks;
    if (column === 'inProgress') return this.inProgressTasks;
    return this.doneTasks;
  }

  getColumnArray(column: ColumnId): Task[] {
    return this.getColumnTasks(column);
  }

  openAddTask(column: ColumnId): void {
    this.addToColumn = column;
    this.isEditMode = false;
    this.editContext = null;
    this.formTask = {
      ...this.createEmptyTask(),
      id: Date.now().toString(),
      statusLabel: column === 'todo' ? 'Backlog' : column === 'inProgress' ? 'Active' : 'Ready to deploy',
    };
    this.showTaskForm = true;
  }

  openEditTask(task: Task, column: ColumnId, index: number): void {
    const actualIndex = this.getColumnArray(column).findIndex((item) => item.id === task.id);
    if (actualIndex < 0) return;
    this.isEditMode = true;
    this.editContext = { column, index: actualIndex };
    this.formTask = { ...task };
    this.showTaskForm = true;
  }

  saveTask(): void {
    const t = this.formTask;
    if (!t.title?.trim()) return;

    if (this.isEditMode && this.editContext) {
      const arr = this.getColumnArray(this.editContext.column);
      arr[this.editContext.index] = { ...t };
    } else {
      const newTask: Task = {
        ...this.createEmptyTask(),
        ...t,
        id: t.id || Date.now().toString(),
        title: t.title.trim(),
        description: t.description?.trim() ?? '',
        statusLabel:
          this.addToColumn === 'todo'
            ? 'Backlog'
            : this.addToColumn === 'inProgress'
              ? 'Active'
              : 'Ready to deploy',
      };
      this.getColumnArray(this.addToColumn).push(newTask);
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

  deleteTask(column: ColumnId, index: number): void {
    const arr = this.getColumnArray(column);
    if (index >= 0 && index < arr.length) {
      arr.splice(index, 1);
      this.saveToStorage();
    }
  }

  deleteTaskById(column: ColumnId, taskId: string): void {
    const arr = this.getColumnArray(column);
    const index = arr.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      arr.splice(index, 1);
      this.saveToStorage();
    }
  }

  onDragStart(column: ColumnId, task: Task, event: DragEvent): void {
    const index = this.getColumnTasks(column).findIndex((item) => item.id === task.id);
    if (index < 0) return;
    this.dragSource = { column, index, taskId: task.id };
    if (event.dataTransfer && task) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', JSON.stringify({ column, index, taskId: task.id }));
      event.dataTransfer.setData('application/json', JSON.stringify({ column, index }));
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  }

  onDrop(targetColumn: ColumnId, event: DragEvent): void {
    event.preventDefault();
    if (!this.dragSource) return;
    const { column: sourceColumn, taskId: sourceTaskId } = this.dragSource;
    const sourceArrayNow = this.getColumnTasks(sourceColumn);
    const sourceIndex = sourceArrayNow.findIndex((task) => task.id === sourceTaskId);
    if (sourceIndex < 0) {
      this.dragSource = null;
      return;
    }

    if (sourceColumn === targetColumn) {
      if (targetColumn === 'todo') {
        const todo = this.getColumnTasks('todo');
        const [moved] = todo.splice(sourceIndex, 1);
        if (moved) {
          todo.push(moved);
          this.saveToStorage();
        }
      }
      this.dragSource = null;
      return;
    }

    const sourceList = this.getColumnTasks(sourceColumn);
    const task = sourceList[sourceIndex];
    if (!task) {
      this.dragSource = null;
      return;
    }

    const targetArray =
      targetColumn === 'todo'
        ? this.todoTasks
        : targetColumn === 'inProgress'
          ? this.inProgressTasks
          : this.doneTasks;
    const sourceArray =
      sourceColumn === 'todo'
        ? this.todoTasks
        : sourceColumn === 'inProgress'
          ? this.inProgressTasks
          : this.doneTasks;

    sourceArray.splice(sourceIndex, 1);
    const updatedTask = this.updateTaskStatusForColumn({ ...task }, targetColumn);
    targetArray.push(updatedTask);
    this.saveToStorage();
    this.dragSource = null;
  }

  onDropOnTask(targetColumn: ColumnId, targetTaskId: string, event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.dragSource) return;
    const { column: sourceColumn, taskId: sourceTaskId } = this.dragSource;
    const placeAfterTarget = this.shouldPlaceAfterTarget(event);

    const sourceArray = this.getColumnTasks(sourceColumn);
    const targetArray = this.getColumnTasks(targetColumn);
    const sourceIndex = sourceArray.findIndex((task) => task.id === sourceTaskId);
    const sourceTask = sourceArray[sourceIndex];
    if (!sourceTask) {
      this.dragSource = null;
      return;
    }

    const targetIndex = targetArray.findIndex((task) => task.id === targetTaskId);
    if (targetIndex < 0) {
      this.dragSource = null;
      return;
    }

    if (sourceColumn === targetColumn) {
      if (targetColumn !== 'todo') {
        this.dragSource = null;
        return;
      }

      if (sourceTaskId === targetTaskId) {
        this.dragSource = null;
        return;
      }

      if (this.priorityFilter === 'All') {
        this.moveTaskById(sourceArray, sourceTaskId, targetTaskId, placeAfterTarget);
      } else {
        // Reorder only the visible (filtered) todo tasks and keep hidden tasks in-place.
        this.reorderVisibleTodoTasks(sourceTaskId, targetTaskId, placeAfterTarget);
      }

      this.saveToStorage();
      this.dragSource = null;
      return;
    }

    sourceArray.splice(sourceIndex, 1);
    const updatedTask = this.updateTaskStatusForColumn({ ...sourceTask }, targetColumn);
    const insertIndex = placeAfterTarget ? targetIndex + 1 : targetIndex;
    targetArray.splice(insertIndex, 0, updatedTask);
    this.saveToStorage();
    this.dragSource = null;
  }

  onDragEnd(): void {
    this.dragSource = null;
  }

  private updateTaskStatusForColumn(task: Task, column: ColumnId): Task {
    if (column === 'todo') {
      task.statusLabel = 'Backlog';
    } else if (column === 'inProgress') {
      task.statusLabel = 'Active';
    } else {
      task.statusLabel = 'Ready to deploy';
    }
    return task;
  }

  private reorderVisibleTodoTasks(sourceTaskId: string, targetTaskId: string, placeAfterTarget: boolean): void {
    if (this.priorityFilter === 'All') return;

    const visibleTasks = this.todoTasks.filter((task) => task.priority === this.priorityFilter);
    const visibleTaskIds = visibleTasks.map((task) => task.id);
    const moved = this.moveTaskId(visibleTaskIds, sourceTaskId, targetTaskId, placeAfterTarget);
    if (!moved) {
      return;
    }

    const taskMap = new Map(this.todoTasks.map((task) => [task.id, task]));

    let visiblePointer = 0;
    for (let i = 0; i < this.todoTasks.length; i += 1) {
      if (this.todoTasks[i].priority === this.priorityFilter) {
        const nextTask = taskMap.get(visibleTaskIds[visiblePointer]);
        if (nextTask) {
          this.todoTasks[i] = nextTask;
        }
        visiblePointer += 1;
      }
    }
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

  private moveTaskId(taskIds: string[], sourceTaskId: string, targetTaskId: string, placeAfterTarget: boolean): boolean {
    const sourceIndex = taskIds.indexOf(sourceTaskId);
    const targetIndex = taskIds.indexOf(targetTaskId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      return false;
    }

    taskIds.splice(sourceIndex, 1);
    let insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    if (placeAfterTarget) {
      insertIndex += 1;
    }
    taskIds.splice(insertIndex, 0, sourceTaskId);
    return true;
  }

  private shouldPlaceAfterTarget(event: DragEvent): boolean {
    const targetEl = event.currentTarget as HTMLElement | null;
    if (!targetEl) return false;
    const rect = targetEl.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2;
  }
}
