import { Component, inject, ChangeDetectorRef } from '@angular/core';
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
    showPassword = false;

    // Forgot password modal state
    showForgotModal = false;
    resetEmail = '';
    resetEmailError = '';
    isResetting = false;
    resetSuccess = false;

    private authService = inject(AuthService);
    private cdr = inject(ChangeDetectorRef);
    private loadingTimer: ReturnType<typeof setTimeout> | null = null;
    private emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    private minPasswordLength = 6;

    private showLoadingWithDelay(): void {
        this.clearLoadingTimer();
        this.isLoading = false;
        this.loadingTimer = setTimeout(() => {
            this.isLoading = true;
            this.cdr.detectChanges();
            this.loadingTimer = null;
        }, 350);
    }

    private clearLoadingTimer(): void {
        if (!this.loadingTimer) return;
        clearTimeout(this.loadingTimer);
        this.loadingTimer = null;
    }

    private hideLoading(): void {
        this.clearLoadingTimer();
        if (this.isLoading) {
            this.isLoading = false;
            this.cdr.detectChanges();
        }
    }

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

    private handleAuthError(err: any): void {
        // Clear previous errors
        this.emailError = '';
        this.passwordError = '';
        this.errorMsg = '';

        // Get error info - handle different error formats
        const errorCode = err?.code || '';
        const errorMessage = err?.message || String(err) || '';

        console.log('Auth Error - Code:', errorCode);

        // Email not verified — most specific check first
        if (errorCode === 'auth/email-not-verified') {
            this.errorMsg = err?.message || 'Please verify your email before signing in. Check your inbox.';
            this.cdr.detectChanges();
            return;
        }

        // Check for invalid credentials
        if (errorCode === 'auth/invalid-credential' ||
            errorCode === 'auth/invalid-login-credentials' ||
            errorMessage.includes('invalid-credential') ||
            errorMessage.includes('Invalid login credentials') ||
            errorMessage.includes('invalid login credentials')) {

            this.emailError = 'Invalid email or password';
            this.cdr.detectChanges();
            return;
        }

        // Check for wrong password specifically
        if (errorCode === 'auth/wrong-password' ||
            errorCode === 'auth/invalid-password' ||
            errorMessage.includes('wrong-password') ||
            errorMessage.includes('wrong password') ||
            errorMessage.includes('Incorrect password')) {
            this.passwordError = 'Incorrect password. Please try again.';
            this.cdr.detectChanges();
            return;
        }

        // Check for user not found
        if (errorCode === 'auth/user-not-found' ||
            errorMessage.includes('user-not-found') ||
            errorMessage.includes('no user record') ||
            errorMessage.includes('No user found')) {
            this.emailError = 'No account found with this email. Please register first.';
            this.cdr.detectChanges();
            return;
        }

        // Check for user disabled
        if (errorCode === 'auth/user-disabled' ||
            errorMessage.includes('user-disabled')) {
            this.emailError = 'This account has been disabled. Please contact support.';
            this.cdr.detectChanges();
            return;
        }

        // Check for too many attempts
        if (errorCode === 'auth/too-many-requests' ||
            errorMessage.includes('too-many-requests') ||
            errorMessage.includes('too many requests')) {
            this.errorMsg = 'Too many login attempts. Please try again later.';
            this.cdr.detectChanges();
            return;
        }

        // Check for network error
        if (errorCode === 'auth/network-request-failed' ||
            errorMessage.includes('network') ||
            errorMessage.includes('NETWORK')) {
            this.errorMsg = 'Network error. Please check your internet connection.';
            this.cdr.detectChanges();
            return;
        }

        // Default fallback - show general error
        this.errorMsg = 'Login failed. Please check your credentials and try again.';
        console.error('Unhandled login error:', err);
        this.cdr.detectChanges();
    }

    async onSubmit() {
        if (!this.validateForm()) return;

        // Clear previous errors
        this.emailError = '';
        this.passwordError = '';
        this.errorMsg = '';

        this.showLoadingWithDelay();

        try {
            await this.authService.login(this.email.trim(), this.password);
        } catch (err: any) {
            this.hideLoading();
            console.log('Caught error in onSubmit:', err);
            this.handleAuthError(err);
        } finally {
            this.hideLoading();
        }
    }

    openForgotModal(): void {
        this.resetEmail = this.email.trim();
        this.resetEmailError = '';
        this.resetSuccess = false;
        this.showForgotModal = true;
        this.cdr.detectChanges();
    }

    closeForgotModal(): void {
        this.showForgotModal = false;
        this.resetEmail = '';
        this.resetEmailError = '';
        this.resetSuccess = false;
        this.cdr.detectChanges();
    }

    async onSendReset(): Promise<void> {
        this.resetEmailError = '';
        const trimmed = this.resetEmail.trim();
        if (!trimmed) {
            this.resetEmailError = 'Email is required';
            return;
        }
        if (!this.emailRegex.test(trimmed)) {
            this.resetEmailError = 'Please enter a valid email address';
            return;
        }

        this.isResetting = true;
        try {
            await this.authService.sendPasswordReset(trimmed);
        } catch {
            // Error is already toasted inside authService.sendPasswordReset
        } finally {
            this.isResetting = false;
            this.closeForgotModal(); // always close — toastr provides success/error feedback
        }
    }
}
