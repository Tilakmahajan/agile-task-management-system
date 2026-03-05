import { Injectable, inject } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendPasswordResetEmail, sendEmailVerification } from '@angular/fire/auth';
import { Router } from '@angular/router';
import toastr from 'toastr';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth: Auth = inject(Auth);
    private router: Router = inject(Router);

    // Observable of the currently authenticated user
    user$ = user(this.auth);

    async register(email: string, password: string, displayName?: string): Promise<void> {
        try {
            const credential = await createUserWithEmailAndPassword(this.auth, email, password);

            // Fire-and-forget: these should NOT block navigation or throw to the caller.
            // If updateProfile or sendEmailVerification fail, the user is still created
            // and logged in, so we swallow the error gracefully.
            const profileAndVerify = async () => {
                try {
                    if (displayName?.trim()) {
                        await updateProfile(credential.user, { displayName: displayName.trim() });
                    }
                    await sendEmailVerification(credential.user);
                    (toastr as any).success(
                        'Account created! Please verify your email, then sign in.',
                        'Welcome 🎉',
                        { timeOut: 8000 }
                    );
                } catch (e) {
                    // Non-fatal: log but do not surface to user — they are already registered
                    console.warn('Post-registration step failed (non-fatal):', e);
                }
            };
            profileAndVerify(); // intentionally not awaited

            this.router.navigate(['/login']);
        } catch (error) {
            console.error('Registration error:', error);
            const err = error as { code?: string; message?: string; name?: string };
            throw {
                code: err.code || 'unknown',
                message: err.message || String(error),
                name: err.name || 'Error'
            };
        }
    }


    async login(email: string, password: string): Promise<void> {
        try {
            const credential = await signInWithEmailAndPassword(this.auth, email, password);

            // Enforce email verification — sign out immediately if not verified
            if (!credential.user.emailVerified) {
                await signOut(this.auth);
                throw {
                    code: 'auth/email-not-verified',
                    message: 'Please verify your email before signing in. Check your inbox for the verification link.',
                    name: 'EmailNotVerifiedError'
                };
            }

            (toastr as any).success('Login successful!', 'Success');
            this.router.navigate(['/board']);
        } catch (error) {
            console.error("Login error:", error);
            // Re-throw with enhanced error info for better handling
            const err = error as { code?: string; message?: string; name?: string };
            const enhancedError = {
                code: err.code || 'unknown',
                message: err.message || String(error),
                name: err.name || 'Error'
            };
            throw enhancedError;
        }
    }

    async updateProfileData(displayName: string): Promise<void> {
        const currentUser = this.auth.currentUser;
        if (!currentUser) throw new Error('User not logged in');

        try {
            await updateProfile(currentUser, { displayName });
        } catch (error) {
            console.error('Error updating profile:', error);
            throw error;
        }
    }

    async updateUserPassword(currentPassword: string, newPassword: string): Promise<void> {
        const currentUser = this.auth.currentUser;
        if (!currentUser || !currentUser.email) throw new Error('User not logged in or email is missing');

        try {
            // Re-authenticate first
            const credential = EmailAuthProvider.credential(currentUser.email, currentPassword);
            await reauthenticateWithCredential(currentUser, credential);

            // Once re-authenticated, update password
            await updatePassword(currentUser, newPassword);
            (toastr as any).success('Password updated successfully', 'Success');
        } catch (error) {
            console.error('Error updating password:', error);
            const err = error as any;
            if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
                (toastr as any).error('Incorrect current password.', 'Authentication Failed');
            } else if (err.code === 'auth/requires-recent-login') {
                (toastr as any).error('Please log out and log back in to change your password for security reasons.', 'Action Required');
            } else {
                (toastr as any).error(err.message || 'Failed to update password', 'Error');
            }
            throw error;
        }
    }

    async logout(): Promise<void> {
        try {
            await signOut(this.auth);
            (toastr as any).success('Logged out successfully!', 'Success');
            this.router.navigate(['/login']);
        } catch (error) {
            console.error("Logout error:", error);
            throw error;
        }
    }

    async sendPasswordReset(email: string): Promise<void> {
        try {
            await sendPasswordResetEmail(this.auth, email.trim());
            (toastr as any).success('Password reset email sent! Check your inbox.', 'Email Sent');
        } catch (error) {
            console.error('Password reset error:', error);
            const err = error as { code?: string; message?: string };
            if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-email') {
                (toastr as any).error('No account found with that email address.', 'Not Found');
            } else {
                (toastr as any).error('Failed to send reset email. Please try again.', 'Error');
            }
            throw error;
        }
    }
}
