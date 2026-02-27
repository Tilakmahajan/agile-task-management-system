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

    private authService = inject(AuthService);

    async onSubmit() {
        this.errorMsg = '';
        this.isLoading = true;
        try {
            await this.authService.login(this.email, this.password);
        } catch (err: any) {
            this.errorMsg = err.message || 'Login failed.';
            this.isLoading = false;
        }
    }
}
