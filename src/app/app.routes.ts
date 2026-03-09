import { Routes } from '@angular/router';
import { TaskBoard } from './task-board/task-board';
import { LoginComponent } from './login/login.component';
import { RegisterComponent } from './register/register.component';
import { authGuard } from './auth.guard';
import { ProfileEditComponent } from './profile-edit/profile-edit';
import { AnalyticsDashboard } from './analytics-dashboard/analytics-dashboard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'board', component: TaskBoard, canActivate: [authGuard] },
  { path: 'profile-edit', component: ProfileEditComponent, canActivate: [authGuard] },
  { path: 'analytics', component: AnalyticsDashboard, canActivate: [authGuard] }
];
