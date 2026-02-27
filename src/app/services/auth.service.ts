import { Injectable, inject } from '@angular/core';
import { Auth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, user } from '@angular/fire/auth';
import { Router } from '@angular/router';

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
            throw error;
        }
    }

    async login(email: string, password: string): Promise<void> {
        try {
            await signInWithEmailAndPassword(this.auth, email, password);
            this.router.navigate(['/board']);
        } catch (error) {
            console.error("Login error:", error);
            throw error;
        }
    }

    async logout(): Promise<void> {
        try {
            await signOut(this.auth);
            this.router.navigate(['/login']);
        } catch (error) {
            console.error("Logout error:", error);
            throw error;
        }
    }
}
