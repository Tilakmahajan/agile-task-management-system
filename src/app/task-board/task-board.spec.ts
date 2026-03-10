import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TaskBoard } from './task-board';
import { AuthService } from '../services/auth.service';
import { FirestoreService, BoardColumn } from '../services/firestore.service';
import { RouterModule } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('toastr', () => ({
  default: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), options: {} },
}));

// ─── Stubs ────────────────────────────────────────────────────────────────────

const boardSubject = new BehaviorSubject<BoardColumn[]>([]);

const mockFirestoreService = {
  board$: boardSubject.asObservable(),
  localChanges$: of(false),
  initializeBoardSubscription: vi.fn(() => Promise.resolve([])),
  unsubscribeFromBoard: vi.fn(),
  saveBoardData: vi.fn(() => Promise.resolve()),
  markLocalChanges: vi.fn(),
  clearLocalChanges: vi.fn(),
  hasPendingChanges: vi.fn(() => false),
};

const mockAuthService = {
  user$: of(null),
  logout: vi.fn(() => Promise.resolve()),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaskBoard', () => {
  let component: TaskBoard;
  let fixture: ComponentFixture<TaskBoard>;

  beforeEach(async () => {
    vi.clearAllMocks();
    boardSubject.next([]);

    await TestBed.configureTestingModule({
      imports: [TaskBoard, RouterModule.forRoot([])],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: FirestoreService, useValue: mockFirestoreService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskBoard);
    component = fixture.componentInstance;
    // Bootstrap default columns without connecting to Firestore
    (component as any).columns = (component as any).createDefaultColumns();
    fixture.detectChanges();
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should initialise with 3 default columns', () => {
    expect(component.columns.length).toBe(3);
    expect(component.columns[0].id).toBe('todo');
    expect(component.columns[1].id).toBe('inProgress');
    expect(component.columns[2].id).toBe('done');
  });

  // ── Column management ───────────────────────────────────────────────────────

  it('should add a new column', async () => {
    component.newColumnTitle = 'Review';
    await component.addColumn();
    expect(component.columns.length).toBe(4);
    expect(component.columns[3].title).toBe('Review');
  });

  it('should not add a column when title is blank', async () => {
    component.newColumnTitle = '   ';
    await component.addColumn();
    expect(component.columns.length).toBe(3);
  });

  it('canRemoveColumns should be true when more than 1 column exists', () => {
    expect(component.canRemoveColumns).toBe(true);
  });

  // ── Task form ───────────────────────────────────────────────────────────────

  it('should open the add-task form for the correct column', () => {
    component.openAddTask('todo');
    expect(component.showTaskForm).toBe(true);
    expect((component as any).addToColumnId).toBe('todo');
    expect(component.isEditMode).toBe(false);
  });

  it('cancelForm() should close the task form', () => {
    component.openAddTask('todo');
    component.cancelForm();
    expect(component.showTaskForm).toBe(false);
  });

  it('saveTask() should add a task to the target column', async () => {
    component.openAddTask('todo');
    component.formTask.title = 'My New Task';
    component.formTask.priority = 'High';
    await component.saveTask();
    const todoColumn = component.columns.find((c) => c.id === 'todo')!;
    expect(todoColumn.tasks.length).toBe(1);
    expect(todoColumn.tasks[0].title).toBe('My New Task');
  });

  it('saveTask() should NOT add a task when title is empty', async () => {
    component.openAddTask('todo');
    component.formTask.title = '   ';
    await component.saveTask();
    const todoColumn = component.columns.find((c) => c.id === 'todo')!;
    expect(todoColumn.tasks.length).toBe(0);
    expect(component.showTaskForm).toBe(false); // form dismissed
  });

  it('saveTask() in edit mode should update the existing task', async () => {
    // First add a task
    component.openAddTask('todo');
    component.formTask.title = 'Original Title';
    await component.saveTask();

    const todoCol = component.columns.find((c) => c.id === 'todo')!;
    const task = todoCol.tasks[0];

    // Now edit it
    component.openEditTask(task, 'todo');
    component.formTask.title = 'Updated Title';
    await component.saveTask();

    expect(todoCol.tasks[0].title).toBe('Updated Title');
  });

  // ── Delete flow ─────────────────────────────────────────────────────────────

  it('confirmDeleteTask() should set context and show confirm dialog', async () => {
    component.openAddTask('todo');
    component.formTask.title = 'Task to delete';
    await component.saveTask();

    const todoCol = component.columns.find((c) => c.id === 'todo')!;
    const task = todoCol.tasks[0];

    component.confirmDeleteTask('todo', task.id, new MouseEvent('click'));
    expect(component.showDeleteConfirm).toBe(true);
    expect(component.deleteContext?.taskId).toBe(task.id);
  });

  it('executeDelete() should remove the task', async () => {
    component.openAddTask('todo');
    component.formTask.title = 'Delete Me';
    await component.saveTask();

    const todoCol = component.columns.find((c) => c.id === 'todo')!;
    component.confirmDeleteTask('todo', todoCol.tasks[0].id, new MouseEvent('click'));
    await component.executeDelete();

    expect(todoCol.tasks.length).toBe(0);
    expect(component.showDeleteConfirm).toBe(false);
  });

  // ── Computed stats ──────────────────────────────────────────────────────────

  it('statsColumns should return one entry per column', () => {
    expect(component.statsColumns.length).toBe(3);
  });

  it('totalVisibleTasksCount should be 0 initially', () => {
    expect(component.totalVisibleTasksCount).toBe(0);
  });
});
