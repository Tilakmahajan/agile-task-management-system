import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type ColumnId = 'todo' | 'inProgress' | 'done';

export interface Task {
  id: string;
  title: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  label: string;
  meta: string;
  statusLabel: string;
}

const STORAGE_KEY = 'agile-task-board';

const DEFAULT_TODO: Task[] = [
  {
    id: '1',
    title: 'Design UI',
    description: 'Explore layout, visual hierarchy, and interactions for the main board experience.',
    priority: 'High',
    label: 'UI',
    meta: 'Design · 1d est.',
    statusLabel: 'Backlog',
  },
  {
    id: '2',
    title: 'Create components',
    description: 'Break the board into reusable, well-structured Angular components.',
    priority: 'Medium',
    label: 'NG',
    meta: 'Frontend · 2d est.',
    statusLabel: 'Ready',
  },
];
const DEFAULT_IN_PROGRESS: Task[] = [
  {
    id: '3',
    title: 'Implement board UI',
    description: 'Wire the task columns, cards, and responsive layout using Tailwind and Angular templates.',
    priority: 'Medium',
    label: 'FE',
    meta: 'Frontend · 60% complete',
    statusLabel: 'Active',
  },
];
const DEFAULT_DONE: Task[] = [
  {
    id: '4',
    title: 'Project setup',
    description: 'Initialize Angular app, configure Tailwind, and prepare the workspace for agile workflows.',
    priority: 'Medium',
    label: '✔',
    meta: 'Completed · Today',
    statusLabel: 'Ready to deploy',
  },
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

  showTaskForm = false;
  isEditMode = false;
  addToColumn: ColumnId = 'todo';
  editContext: { column: ColumnId; index: number } | null = null;

  formTask: Task = this.createEmptyTask();

  private dragSource: { column: ColumnId; index: number } | null = null;

  ngOnInit(): void {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as { todo: Task[]; inProgress: Task[]; done: Task[] };
        if (Array.isArray(data.todo)) this.todoTasks = data.todo;
        if (Array.isArray(data.inProgress)) this.inProgressTasks = data.inProgress;
        if (Array.isArray(data.done)) this.doneTasks = data.done;
        if (this.todoTasks.length || this.inProgressTasks.length || this.doneTasks.length) {
          return;
        }
      }
    } catch {
      // invalid or missing – use defaults
    }
    this.todoTasks = DEFAULT_TODO.map((t) => ({ ...t }));
    this.inProgressTasks = DEFAULT_IN_PROGRESS.map((t) => ({ ...t }));
    this.doneTasks = DEFAULT_DONE.map((t) => ({ ...t }));
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
      label: 'New',
      meta: '',
      statusLabel: 'Backlog',
    };
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
    this.isEditMode = true;
    this.editContext = { column, index };
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
        meta: t.meta?.trim() || 'No details',
        statusLabel:
          this.addToColumn === 'todo'
            ? 'Backlog'
            : this.addToColumn === 'inProgress'
              ? 'Active'
              : 'Ready to deploy',
      };
      this.getColumnArray(this.addToColumn).push(newTask);
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

  onDragStart(column: ColumnId, index: number, event: DragEvent): void {
    this.dragSource = { column, index };
    const task = this.getColumnTasks(column)[index];
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
    const { column: sourceColumn, index: sourceIndex } = this.dragSource;
    this.dragSource = null;

    if (sourceColumn === targetColumn) return;

    const sourceList = this.getColumnTasks(sourceColumn);
    const task = sourceList[sourceIndex];
    if (!task) return;

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
}
