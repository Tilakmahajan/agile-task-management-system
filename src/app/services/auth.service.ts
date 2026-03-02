import { Injectable, inject } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
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
