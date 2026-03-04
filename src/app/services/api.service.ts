import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { Task } from './firestore.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  
  // Using JSONPlaceholder as a mock API to demonstrate network responses
  // In production, replace with your actual API endpoint
  private readonly API_BASE = 'https://jsonplaceholder.typicode.com';

  /**
   * Create a new task - makes POST request
   */
  createTask(task: Task): Observable<any> {
    // Using JSONPlaceholder's posts endpoint as a mock
    // This will show in the Network tab as a real HTTP request
    return this.http.post(`${this.API_BASE}/posts`, {
      ...task,
      userId: 1
    }, {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    });
  }

  /**
   * Update an existing task - makes PUT request
   */
  updateTask(task: Task): Observable<any> {
    // Using JSONPlaceholder's posts endpoint as a mock
    return this.http.put(`${this.API_BASE}/posts/${task.id}`, {
      ...task,
      userId: 1
    }, {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    });
  }

  /**
   * Delete a task - makes DELETE request
   */
  deleteTask(taskId: string): Observable<any> {
    // Using JSONPlaceholder's posts endpoint as a mock
    return this.http.delete(`${this.API_BASE}/posts/${taskId}`);
  }

  /**
   * Login - makes POST request (mock)
   */
  login(email: string, password: string): Observable<any> {
    return this.http.post(`${this.API_BASE}/posts`, {
      email,
      password,
      action: 'login'
    }, {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    });
  }

  /**
   * Logout - makes POST request (mock)
   */
  logout(): Observable<any> {
    return this.http.post(`${this.API_BASE}/posts`, {
      action: 'logout'
    }, {
      headers: new HttpHeaders({
        'Content-Type': 'application/json'
      })
    });
  }
}
