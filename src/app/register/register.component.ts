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

    private authService = inject(AuthService);

    async onSubmit() {
        if (this.password !== this.confirmPassword) {
            this.errorMsg = "Passwords do not match!";
            return;
        }

        this.errorMsg = '';
        this.isLoading = true;
        try {
            await this.authService.register(this.email, this.password);
        } catch (err: any) {
            this.errorMsg = err.message || 'Registration failed.';
            this.isLoading = false;
        }
    }
}
