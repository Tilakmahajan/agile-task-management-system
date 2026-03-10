import { TestBed } from '@angular/core/testing';
import { FirestoreService, BoardColumn } from './firestore.service';
import { Firestore } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Firestore + Auth mocks ───────────────────────────────────────────────────

vi.mock('@angular/fire/firestore', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@angular/fire/firestore')>();
    return {
        ...actual,
        Firestore: class { },
        collection: vi.fn(() => ({})),
        doc: vi.fn(() => ({})),
        query: vi.fn((col) => col),
        orderBy: vi.fn(),
        onSnapshot: vi.fn(() => () => { }), // returns an unsubscribe noop
        writeBatch: vi.fn(() => ({
            set: vi.fn(),
            delete: vi.fn(),
            commit: vi.fn(() => Promise.resolve()),
        })),
        setDoc: vi.fn(() => Promise.resolve()),
        deleteDoc: vi.fn(() => Promise.resolve()),
        getDocs: vi.fn(() => Promise.resolve({ forEach: vi.fn() })),
    };
});

const mockUser = { uid: 'testUser123' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FirestoreService', () => {
    let service: FirestoreService;

    beforeEach(() => {
        vi.clearAllMocks();

        TestBed.configureTestingModule({
            providers: [
                FirestoreService,
                { provide: Firestore, useValue: {} },
                { provide: Auth, useValue: { currentUser: mockUser } },
            ],
        });
        service = TestBed.inject(FirestoreService);
    });

    // ── State tracking ──────────────────────────────────────────────────────────

    it('should return false for hasPendingChanges() initially', () => {
        expect(service.hasPendingChanges()).toBe(false);
    });

    it('should return true for hasPendingChanges() after markLocalChanges()', () => {
        service.markLocalChanges();
        expect(service.hasPendingChanges()).toBe(true);
    });

    it('should return false after clearLocalChanges()', () => {
        service.markLocalChanges();
        service.clearLocalChanges();
        expect(service.hasPendingChanges()).toBe(false);
    });

    // ── unsubscribeFromBoard() ──────────────────────────────────────────────────

    it('should emit empty board after unsubscribeFromBoard()', () => {
        const values: BoardColumn[][] = [];
        service.board$.subscribe((v) => values.push(v));

        service.unsubscribeFromBoard();
        // The last emission should be an empty array
        expect(values[values.length - 1]).toEqual([]);
    });

    // ── saveBoardData() ─────────────────────────────────────────────────────────

    it('should call writeBatch.commit when saveBoardData is called with columns', async () => {
        const { writeBatch } = await import('@angular/fire/firestore');
        const mockBatch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
        (writeBatch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);

        const columns: BoardColumn[] = [
            { id: 'todo', title: 'To Do', statusLabel: 'Backlog', accent: 'todo', tasks: [], isDefault: true },
        ];

        await service.saveBoardData(columns);

        expect(mockBatch.commit).toHaveBeenCalled();
    });

    it('should throw when saveBoardData is called with no authenticated user', async () => {
        // Override Auth to simulate no user
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            providers: [
                FirestoreService,
                { provide: Firestore, useValue: {} },
                { provide: Auth, useValue: { currentUser: null } },
            ],
        });
        const unauthService = TestBed.inject(FirestoreService);

        await expect(unauthService.saveBoardData([])).rejects.toThrow('User not authenticated');
    });

    // ── getFriendlyErrorMessage (via saveBoardData rejection) ──────────────────

    it('should map permission-denied to a friendly error message', async () => {
        const { writeBatch } = await import('@angular/fire/firestore');
        const mockBatch = {
            set: vi.fn(),
            delete: vi.fn(),
            commit: vi.fn(() => Promise.reject({ code: 'permission-denied', message: 'permission-denied' })),
        };
        (writeBatch as ReturnType<typeof vi.fn>).mockReturnValue(mockBatch);

        await expect(service.saveBoardData([])).rejects.toThrow('Permission denied');
    });
});
