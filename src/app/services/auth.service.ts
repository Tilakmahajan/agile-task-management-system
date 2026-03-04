import { Injectable, inject } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user, updateProfile, updatePassword } from '@angular/fire/auth';
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

    async register(email: string, password: string): Promise<void> {
        try {
            await createUserWithEmailAndPassword(this.auth, email, password);
            this.router.navigate(['/board']);
        } catch (error) {
            console.error("Registration error:", error);
            // Re-throw with enhanced error info
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
            await signInWithEmailAndPassword(this.auth, email, password);
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
            console.log("Enhanced Firebase Error:", enhancedError);
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

    async updateUserPassword(newPassword: string): Promise<void> {
        const currentUser = this.auth.currentUser;
        if (!currentUser) throw new Error('User not logged in');

        try {
            await updatePassword(currentUser, newPassword);
            (toastr as any).success('Password updated successfully', 'Success');
        } catch (error) {
            console.error('Error updating password:', error);
            // Firebase reauthentication might be required
            const err = error as any;
            if (err.code === 'auth/requires-recent-login') {
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
}
