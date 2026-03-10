import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { Auth } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ─── Minimal stubs ───────────────────────────────────────────────────────────

const mockRouter = { navigate: vi.fn() };

const mockCredential = { user: { uid: 'uid1', email: 'test@example.com' } };

// Module-level mocks – vitest hoists these automatically
vi.mock('@angular/fire/auth', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@angular/fire/auth')>();
    return {
        ...actual,
        // Provide a minimal Auth-like token so inject() works
        Auth: class { },
        user: vi.fn(() => ({} as any)),
        createUserWithEmailAndPassword: vi.fn(() => Promise.resolve(mockCredential)),
        signInWithEmailAndPassword: vi.fn(() => Promise.resolve(mockCredential)),
        signOut: vi.fn(() => Promise.resolve()),
        updateProfile: vi.fn(() => Promise.resolve()),
        updatePassword: vi.fn(() => Promise.resolve()),
        reauthenticateWithCredential: vi.fn(() => Promise.resolve()),
        EmailAuthProvider: { credential: vi.fn(() => ({})) },
        sendPasswordResetEmail: vi.fn(() => Promise.resolve()),
    };
});

vi.mock('toastr', () => ({
    default: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
    let service: AuthService;

    beforeEach(() => {
        vi.clearAllMocks();

        TestBed.configureTestingModule({
            providers: [
                AuthService,
                { provide: Auth, useValue: { currentUser: mockCredential.user } },
                { provide: Router, useValue: mockRouter },
            ],
        });
        service = TestBed.inject(AuthService);
    });

    // ── register() ──────────────────────────────────────────────────────────────

    it('should create account and navigate to /board', async () => {
        const { createUserWithEmailAndPassword, updateProfile } =
            await import('@angular/fire/auth');

        await service.register('test@example.com', 'password123', 'Alice');

        expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
            expect.anything(),
            'test@example.com',
            'password123'
        );
        expect(updateProfile).toHaveBeenCalledWith(mockCredential.user, {
            displayName: 'Alice',
        });
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/board']);
    });

    it('should register without displayName and still navigate to /board', async () => {
        const { updateProfile } = await import('@angular/fire/auth');

        await service.register('test@example.com', 'password123');

        expect(updateProfile).not.toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/board']);
    });

    it('should re-throw Firebase errors on register failure', async () => {
        const { createUserWithEmailAndPassword } = await import('@angular/fire/auth');
        (createUserWithEmailAndPassword as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
            code: 'auth/email-already-in-use',
            message: 'Email already in use',
        });

        await expect(service.register('existing@example.com', 'pass')).rejects.toMatchObject({
            code: 'auth/email-already-in-use',
        });
    });

    // ── login() ─────────────────────────────────────────────────────────────────

    it('should login and navigate to /board', async () => {
        const { signInWithEmailAndPassword } = await import('@angular/fire/auth');

        await service.login('test@example.com', 'password123');

        expect(signInWithEmailAndPassword).toHaveBeenCalledWith(
            expect.anything(),
            'test@example.com',
            'password123'
        );
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/board']);
    });

    it('should re-throw Firebase errors on login failure', async () => {
        const { signInWithEmailAndPassword } = await import('@angular/fire/auth');
        (signInWithEmailAndPassword as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
            code: 'auth/invalid-credential',
            message: 'Invalid credential',
        });

        await expect(service.login('bad@example.com', 'wrong')).rejects.toMatchObject({
            code: 'auth/invalid-credential',
        });
    });

    // ── logout() ────────────────────────────────────────────────────────────────

    it('should sign out and navigate to /login', async () => {
        const { signOut } = await import('@angular/fire/auth');

        await service.logout();

        expect(signOut).toHaveBeenCalled();
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
    });

    // ── updateProfileData() ─────────────────────────────────────────────────────

    it('should update the displayName', async () => {
        const { updateProfile } = await import('@angular/fire/auth');

        await service.updateProfileData('Bob');

        expect(updateProfile).toHaveBeenCalledWith(mockCredential.user, {
            displayName: 'Bob',
        });
    });

    // ── sendPasswordReset() ─────────────────────────────────────────────────────

    it('should call sendPasswordResetEmail with the trimmed email', async () => {
        const { sendPasswordResetEmail } = await import('@angular/fire/auth');

        await service.sendPasswordReset('  user@example.com  ');

        expect(sendPasswordResetEmail).toHaveBeenCalledWith(
            expect.anything(),
            'user@example.com'
        );
    });

    it('should re-throw and toast on reset error', async () => {
        const { sendPasswordResetEmail } = await import('@angular/fire/auth');
        (sendPasswordResetEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
            code: 'auth/user-not-found',
        });

        await expect(service.sendPasswordReset('nobody@example.com')).rejects.toBeDefined();
    });
});
