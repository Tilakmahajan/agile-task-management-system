import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
    selector: 'app-register',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink],
    templateUrl: './register.component.html',
    styleUrl: '../login/login.component.css'
})
export class RegisterComponent {
    fullName = '';
    email = '';
    password = '';
    confirmPassword = '';
    errorMsg = '';
    isLoading = false;

    // Validation error messages
    fullNameError = '';
    emailError = '';
    passwordError = '';
    confirmPasswordError = '';

    private authService = inject(AuthService);

    // Email validation regex
    private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Minimum password length
    private minPasswordLength = 6;

    // Minimum full name length
    private minFullNameLength = 2;

    private validateForm(): boolean {
        this.fullNameError = '';
        this.emailError = '';
        this.passwordError = '';
        this.confirmPasswordError = '';

        let isValid = true;

        // Validate full name
        if (!this.fullName.trim()) {
            this.fullNameError = 'Full name is required';
            isValid = false;
        } else if (this.fullName.trim().length < this.minFullNameLength) {
            this.fullNameError = 'Full name must be at least 2 characters';
            isValid = false;
        }

        // Validate email
        if (!this.email.trim()) {
            this.emailError = 'Email is required';
            isValid = false;
        } else if (!this.emailRegex.test(this.email.trim())) {
            this.emailError = 'Please enter a valid email address';
            isValid = false;
        }

        // Validate password
        if (!this.password) {
            this.passwordError = 'Password is required';
            isValid = false;
        } else if (this.password.length < this.minPasswordLength) {
            this.passwordError = 'Password must be at least 6 characters';
            isValid = false;
        }

        // Validate confirm password
        if (!this.confirmPassword) {
            this.confirmPasswordError = 'Please confirm your password';
            isValid = false;
        } else if (this.password !== this.confirmPassword) {
            this.confirmPasswordError = 'Passwords do not match!';
            isValid = false;
        }

        return isValid;
    }

    async onSubmit() {
        // Validate form first
        if (!this.validateForm()) {
            return;
        }

        this.errorMsg = '';
        this.isLoading = true;
        try {
            await this.authService.register(this.email.trim(), this.password, this.fullName.trim());
        } catch (err: any) {
            // Provide user-friendly error messages
            const errorCode = err.code || '';
            if (errorCode === 'auth/email-already-in-use') {
                this.emailError = 'This email is already registered. Please login.';
                this.errorMsg = '';
            } else if (errorCode === 'auth/invalid-email') {
                this.emailError = 'Invalid email address format';
                this.errorMsg = '';
            } else if (errorCode === 'auth/weak-password') {
                this.passwordError = 'Password is too weak. Please use a stronger password.';
                this.errorMsg = '';
            } else if (errorCode === 'auth/invalid-credential') {
                this.errorMsg = 'Invalid credentials. Please try again.';
            } else {
                this.errorMsg = err.message || 'Registration failed. Please try again.';
            }
        } finally {
            // Always reset loading — prevents the form from getting permanently stuck
            this.isLoading = false;
        }
    }
}
