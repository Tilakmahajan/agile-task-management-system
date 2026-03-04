import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Subscription } from 'rxjs';
import toastr from 'toastr';

@Component({
  selector: 'app-profile-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './profile-edit.html',
  styleUrl: './profile-edit.css'
})
export class ProfileEditComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  profileForm!: FormGroup;
  isLoading = false;
  private authSubscription: Subscription | null = null;
  private currentDisplayName = '';

  ngOnInit(): void {
    this.initForm();

    // Subscribe to auth state to populate current name
    this.authSubscription = this.authService.user$.subscribe(user => {
      if (user) {
        this.currentDisplayName = user.displayName || '';
        this.profileForm.patchValue({
          displayName: this.currentDisplayName
        });
      } else {
        // Not logged in, redirect
        this.router.navigate(['/login']);
      }
    });

    // Run custom validator when newPassword changes
    this.profileForm.get('newPassword')?.valueChanges.subscribe(() => {
      this.profileForm.get('confirmPassword')?.updateValueAndValidity();
    });
  }

  ngOnDestroy(): void {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  private initForm(): void {
    this.profileForm = this.fb.group({
      displayName: ['', [Validators.required, Validators.maxLength(50)]],
      newPassword: ['', [Validators.minLength(6)]],
      confirmPassword: ['']
    }, { validators: this.passwordMatchValidator });
  }

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('newPassword')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;

    if (password && password !== confirmPassword) {
      return { passwordMismatch: true };
    }
    return null;
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid || this.isLoading) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    const formVals = this.profileForm.value;
    const newName = formVals.displayName?.trim();
    const newPassword = formVals.newPassword;

    try {
      let isNameUpdated = false;
      let isPasswordUpdated = false;

      // Update name if changed
      if (newName && newName !== this.currentDisplayName) {
        await this.authService.updateProfileData(newName);
        isNameUpdated = true;
        this.currentDisplayName = newName; // Update local state on success
      }

      // Update password if provided
      if (newPassword) {
        await this.authService.updateUserPassword(newPassword);
        isPasswordUpdated = true;

        // Clear password fields after success
        this.profileForm.patchValue({
          newPassword: '',
          confirmPassword: ''
        });
        this.profileForm.get('newPassword')?.markAsPristine();
        this.profileForm.get('confirmPassword')?.markAsPristine();
      }

      if (isNameUpdated && !isPasswordUpdated) {
        (toastr as any).success('Profile name updated successfully!', 'Success');
      } else if (isNameUpdated && isPasswordUpdated) {
        (toastr as any).success('Profile and password updated successfully!', 'Success');
      } else if (!isNameUpdated && !isPasswordUpdated) {
        (toastr as any).info('No changes were made.');
      }

      // Mark whole form as pristine so the save button disables again
      this.profileForm.markAsPristine();

    } catch (error) {
      // Error is already logged and toasted in the service layer where appropriate
    } finally {
      this.isLoading = false;
    }
  }
}
