import { Injectable, inject } from '@angular/core';
import { Analytics, logEvent, setUserId, setCurrentScreen, isSupported } from '@angular/fire/analytics';
import { Auth } from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc, updateDoc, increment } from '@angular/fire/firestore';
import { BehaviorSubject, Observable } from 'rxjs';

export interface TaskAnalytics {
    totalTasks: number;
    completedTasks: number;
    inProgressTasks: number;
    todoTasks: number;
    highPriorityTasks: number;
    mediumPriorityTasks: number;
    lowPriorityTasks: number;
    tasksByColumn: { [key: string]: number };
    lastUpdated: Date;
}

export interface UserActivity {
    userId: string;
    email: string;
    displayName: string;
    lastLogin: Date;
    totalLogins: number;
    tasksCreated: number;
    tasksCompleted: number;
}

@Injectable({
    providedIn: 'root'
})
export class AnalyticsService {
    private analytics: Analytics | null = null;
    private auth: Auth = inject(Auth);
    private firestore: Firestore = inject(Firestore);
    
    private analyticsSubject = new BehaviorSubject<TaskAnalytics>({
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        todoTasks: 0,
        highPriorityTasks: 0,
        mediumPriorityTasks: 0,
        lowPriorityTasks: 0,
        tasksByColumn: {},
        lastUpdated: new Date()
    });

    analytics$ = this.analyticsSubject.asObservable();

    constructor() {
        this.initializeAnalytics();
    }

    private async initializeAnalytics(): Promise<void> {
        const supported = await isSupported();
        if (supported) {
            this.analytics = inject(Analytics);
            console.log('Firebase Analytics initialized');
        } else {
            console.warn('Firebase Analytics is not supported in this environment');
        }
    }

    // Track authentication events
    trackLogin(method: 'email' | 'google'): void {
        this.logEvent('login', {
            method: method,
            timestamp: new Date().toISOString()
        });
        
        // Update user ID for analytics
        const user = this.auth.currentUser;
        if (user) {
            this.setUserId(user.uid);
            this.trackUserLogin(user.uid, user.email || '', user.displayName || '');
        }
    }

    trackLogout(): void {
        this.logEvent('logout', {
            timestamp: new Date().toISOString()
        });
    }

    trackSignUp(method: 'email' | 'google'): void {
        this.logEvent('sign_up', {
            method: method,
            timestamp: new Date().toISOString()
        });
    }

    // Track task events
    trackTaskCreated(taskTitle: string, priority: string, columnId: string): void {
        this.logEvent('task_created', {
            task_title: taskTitle,
            priority: priority,
            column_id: columnId,
            timestamp: new Date().toISOString()
        });

        const user = this.auth.currentUser;
        if (user) {
            this.incrementUserTaskCreated(user.uid);
        }
    }

    trackTaskCompleted(taskTitle: string, priority: string): void {
        this.logEvent('task_completed', {
            task_title: taskTitle,
            priority: priority,
            timestamp: new Date().toISOString()
        });

        const user = this.auth.currentUser;
        if (user) {
            this.incrementUserTaskCompleted(user.uid);
        }
    }

    trackTaskDeleted(taskTitle: string): void {
        this.logEvent('task_deleted', {
            task_title: taskTitle,
            timestamp: new Date().toISOString()
        });
    }

    trackTaskMoved(taskTitle: string, fromColumn: string, toColumn: string): void {
        this.logEvent('task_moved', {
            task_title: taskTitle,
            from_column: fromColumn,
            to_column: toColumn,
            timestamp: new Date().toISOString()
        });
    }

    // Track screen views
    trackScreenView(screenName: string): void {
        this.setCurrentScreen(screenName);
        this.logEvent('screen_view', {
            screen_name: screenName,
            timestamp: new Date().toISOString()
        });
    }

    // Track column events
    trackColumnAdded(columnTitle: string): void {
        this.logEvent('column_added', {
            column_title: columnTitle,
            timestamp: new Date().toISOString()
        });
    }

    trackColumnRemoved(columnTitle: string): void {
        this.logEvent('column_removed', {
            column_title: columnTitle,
            timestamp: new Date().toISOString()
        });
    }

    // Update analytics based on current board state
    updateTaskAnalytics(columns: any[]): void {
        const analytics: TaskAnalytics = {
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            todoTasks: 0,
            highPriorityTasks: 0,
            mediumPriorityTasks: 0,
            lowPriorityTasks: 0,
            tasksByColumn: {},
            lastUpdated: new Date()
        };

        columns.forEach(column => {
            const taskCount = column.tasks?.length || 0;
            analytics.tasksByColumn[column.id] = taskCount;
            analytics.totalTasks += taskCount;

            // Count by column status
            if (column.id === 'done' || column.title.toLowerCase().includes('done')) {
                analytics.completedTasks += taskCount;
            } else if (column.id === 'todo' || column.title.toLowerCase().includes('to do')) {
                analytics.todoTasks += taskCount;
            } else {
                analytics.inProgressTasks += taskCount;
            }

            // Count by priority
            column.tasks?.forEach((task: any) => {
                if (task.priority === 'High') {
                    analytics.highPriorityTasks++;
                } else if (task.priority === 'Medium') {
                    analytics.mediumPriorityTasks++;
                } else if (task.priority === 'Low') {
                    analytics.lowPriorityTasks++;
                }
            });
        });

        this.analyticsSubject.next(analytics);

        // Also save to Firestore for persistence
        this.saveAnalyticsToFirestore(analytics);
    }

    // Firebase Analytics methods
    private logEvent(eventName: string, params?: Record<string, any>): void {
        if (this.analytics) {
            logEvent(this.analytics, eventName, params);
            console.log(`Analytics event logged: ${eventName}`, params);
        }
    }

    private setUserId(userId: string): void {
        if (this.analytics) {
            setUserId(this.analytics, userId);
        }
    }

    private setCurrentScreen(screenName: string): void {
        if (this.analytics) {
            setCurrentScreen(this.analytics, screenName);
        }
    }

    // Firestore methods for user activity tracking
    private async trackUserLogin(userId: string, email: string, displayName: string): Promise<void> {
        try {
            const userDocRef = doc(this.firestore, `users/${userId}/analytics/activity`);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                await updateDoc(userDocRef, {
                    lastLogin: new Date(),
                    totalLogins: increment(1)
                });
            } else {
                await setDoc(userDocRef, {
                    userId: userId,
                    email: email,
                    displayName: displayName,
                    lastLogin: new Date(),
                    totalLogins: 1,
                    tasksCreated: 0,
                    tasksCompleted: 0
                });
            }
        } catch (error) {
            console.error('Error tracking user login:', error);
        }
    }

    private async incrementUserTaskCreated(userId: string): Promise<void> {
        try {
            const userDocRef = doc(this.firestore, `users/${userId}/analytics/activity`);
            await updateDoc(userDocRef, {
                tasksCreated: increment(1)
            });
        } catch (error) {
            console.error('Error incrementing task created:', error);
        }
    }

    private async incrementUserTaskCompleted(userId: string): Promise<void> {
        try {
            const userDocRef = doc(this.firestore, `users/${userId}/analytics/activity`);
            await updateDoc(userDocRef, {
                tasksCompleted: increment(1)
            });
        } catch (error) {
            console.error('Error incrementing task completed:', error);
        }
    }

    private async saveAnalyticsToFirestore(analytics: TaskAnalytics): Promise<void> {
        const user = this.auth.currentUser;
        if (!user) return;

        try {
            const analyticsDocRef = doc(this.firestore, `users/${user.uid}/analytics/board`);
            await setDoc(analyticsDocRef, {
                ...analytics,
                lastUpdated: new Date()
            }, { merge: true });
        } catch (error) {
            console.error('Error saving analytics to Firestore:', error);
        }
    }

    // Get user activity data
    async getUserActivity(): Promise<UserActivity | null> {
        const user = this.auth.currentUser;
        if (!user) return null;

        try {
            const userDocRef = doc(this.firestore, `users/${user.uid}/analytics/activity`);
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                return userDoc.data() as UserActivity;
            }
            return null;
        } catch (error) {
            console.error('Error getting user activity:', error);
            return null;
        }
    }

    // Get saved board analytics
    async getBoardAnalytics(): Promise<TaskAnalytics | null> {
        const user = this.auth.currentUser;
        if (!user) return null;

        try {
            const analyticsDocRef = doc(this.firestore, `users/${user.uid}/analytics/board`);
            const analyticsDoc = await getDoc(analyticsDocRef);

            if (analyticsDoc.exists()) {
                return analyticsDoc.data() as TaskAnalytics;
            }
            return null;
        } catch (error) {
            console.error('Error getting board analytics:', error);
            return null;
        }
    }
}

