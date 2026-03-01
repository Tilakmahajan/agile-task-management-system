import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    email = '';
    password = '';
    errorMsg = '';
    isLoading = false;
    emailError = '';
    passwordError = '';

    private authService = inject(AuthService);
    private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private minPasswordLength = 6;

    private validateForm(): boolean {
        this.emailError = '';
        this.passwordError = '';
        let isValid = true;
        if (!this.email.trim()) {
            this.emailError = 'Email is required';
            isValid = false;
        } else if (!this.emailRegex.test(this.email.trim())) {
            this.emailError = 'Please enter a valid email address';
            isValid = false;
        }
        if (!this.password) {
            this.passwordError = 'Password is required';
            isValid = false;
        } else if (this.password.length < this.minPasswordLength) {
            this.passwordError = 'Password must be at least 6 characters';
            isValid = false;
        }
        return isValid;
    }

    async onSubmit() {
        if (!this.validateForm()) return;
        this.errorMsg = '';
        this.isLoading = true;
        try {
            await this.authService.login(this.email.trim(), this.password);
        } catch (err: any) {
            const errorCode = err.code || '';
            if (errorCode === 'auth/user-not-found') {
                this.errorMsg = 'No account found with this email. Please register first.';
            } else if (errorCode === 'auth/wrong-password') {
                this.errorMsg = 'Incorrect password. Please try again.';
            } else if (errorCode === 'auth/invalid-credential') {
                this.errorMsg = 'Invalid email or password. Please try again.';
            } else {
                this.errorMsg = err.message || 'Login failed. Please try again.';
            }
            this.isLoading = false;
        }
    }
}
