import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription, BehaviorSubject, interval, combineLatest } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AnalyticsService, TaskAnalytics, UserActivity } from '../services/analytics.service';
import { FirestoreService, BoardColumn } from '../services/firestore.service';

interface RecentActivity {
    type: 'created' | 'completed' | 'moved' | 'deleted';
    taskTitle: string;
    timestamp: Date;
    column?: string;
}

@Component({
    selector: 'app-analytics-dashboard',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './analytics-dashboard.html',
    styleUrl: './analytics-dashboard.css'
})
export class AnalyticsDashboard implements OnInit, OnDestroy {
    private authService = inject(AuthService);
    private analyticsService = inject(AnalyticsService);
    private firestoreService = inject(FirestoreService);
    private cdr = inject(ChangeDetectorRef);
    
    user$ = this.authService.user$;
    analytics$ = this.analyticsService.analytics$;

    taskAnalytics: TaskAnalytics | null = null;
    userActivity: UserActivity | null = null;
    isLoading = true;
    currentDate = new Date();

    // Real-time data
    recentActivities: RecentActivity[] = [];
    liveTaskCount = 0;
    previousTaskCount = 0;
    isRealTimeConnected = false;
    connectionStatus = 'connecting';

    // Animated counters
    animatedTotal = 0;
    animatedCompleted = 0;
    animatedInProgress = 0;
    animatedTodo = 0;

    private subscriptions: Subscription[] = [];
    private boardSubscription: Subscription | null = null;
    private activitySubject = new BehaviorSubject<RecentActivity[]>([]);

    // Default analytics to use as fallback
    private defaultAnalytics: TaskAnalytics = {
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

    ngOnInit(): void {
        this.initializeBoardAndLoadAnalytics();
        this.startCounterAnimation();
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
        if (this.boardSubscription) {
            this.boardSubscription.unsubscribe();
        }
        this.firestoreService.unsubscribeFromBoard();
    }

    private async initializeBoardAndLoadAnalytics(): Promise<void> {
        this.isLoading = true;
        this.connectionStatus = 'connecting';
        this.cdr.detectChanges();

        try {
            // First initialize the board subscription to start real-time updates from Firestore
            await this.firestoreService.initializeBoardSubscription();
            
            // Now subscribe to real-time updates
            this.subscribeToRealTimeUpdates();

            // Wait briefly for auth and initial data
            await new Promise(resolve => setTimeout(resolve, 500));
            this.cdr.detectChanges();

            // Fetch analytics
            const [analytics, activity] = await Promise.all([
                this.analyticsService.getBoardAnalytics(),
                this.analyticsService.getUserActivity()
            ]);
            
            this.taskAnalytics = analytics;
            this.userActivity = activity;
            this.liveTaskCount = analytics?.totalTasks || 0;
            
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            if (!this.taskAnalytics) {
                this.taskAnalytics = this.defaultAnalytics;
            }
            this.isLoading = false;
            this.animateCounters();
            this.cdr.detectChanges();
        }
    }

    private subscribeToRealTimeUpdates(): void {
        // Subscribe to Firestore board changes for real-time updates
        this.boardSubscription = this.firestoreService.board$.subscribe({
            next: (columns: BoardColumn[]) => {
                this.handleBoardUpdate(columns);
            },
            error: (err) => {
                console.log('Real-time subscription error:', err);
                this.connectionStatus = 'disconnected';
                this.cdr.detectChanges();
            }
        });

        // Mark as connected after a short delay
        setTimeout(() => {
            this.isRealTimeConnected = true;
            this.connectionStatus = 'connected';
            this.cdr.detectChanges();
        }, 2000);
    }

    private handleBoardUpdate(columns: BoardColumn[]): void {
        if (!columns || columns.length === 0) return;

        // Calculate new analytics from board data
        const newAnalytics = this.calculateAnalyticsFromColumns(columns);
        
        // Track changes for activity feed
        if (this.taskAnalytics && this.taskAnalytics.totalTasks !== newAnalytics.totalTasks) {
            const diff = newAnalytics.totalTasks - this.taskAnalytics.totalTasks;
            if (diff > 0) {
                this.addActivity('created', `${diff} new task(s)`);
            }
        }

        // Update analytics
        this.taskAnalytics = newAnalytics;
        this.previousTaskCount = this.liveTaskCount;
        this.liveTaskCount = newAnalytics.totalTasks;
        
        // Trigger animations
        this.animateCounters();
        
        this.cdr.detectChanges();
    }

    private calculateAnalyticsFromColumns(columns: BoardColumn[]): TaskAnalytics {
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
            const columnId = column.id.toLowerCase();
            analytics.tasksByColumn[columnId] = column.tasks.length;
            analytics.totalTasks += column.tasks.length;

            // Categorize by status
            if (columnId === 'done' || columnId.includes('complete')) {
                analytics.completedTasks += column.tasks.length;
            } else if (columnId === 'inprogress' || columnId.includes('progress')) {
                analytics.inProgressTasks += column.tasks.length;
            } else {
                analytics.todoTasks += column.tasks.length;
            }

            // Categorize by priority
            column.tasks.forEach(task => {
                if (task.priority === 'High') {
                    analytics.highPriorityTasks++;
                } else if (task.priority === 'Medium') {
                    analytics.mediumPriorityTasks++;
                } else {
                    analytics.lowPriorityTasks++;
                }
            });
        });

        return analytics;
    }

    private addActivity(type: RecentActivity['type'], taskTitle: string, column?: string): void {
        const activity: RecentActivity = {
            type,
            taskTitle,
            timestamp: new Date(),
            column
        };
        
        this.recentActivities = [activity, ...this.recentActivities].slice(0, 10);
        this.cdr.detectChanges();
    }

    private startCounterAnimation(): void {
        // Animate counters every time analytics update
        interval(50).subscribe(() => {
            if (this.taskAnalytics) {
                this.animateToValue('animatedTotal', this.taskAnalytics.totalTasks);
                this.animateToValue('animatedCompleted', this.taskAnalytics.completedTasks);
                this.animateToValue('animatedInProgress', this.taskAnalytics.inProgressTasks);
                this.animateToValue('animatedTodo', this.taskAnalytics.todoTasks);
            }
        });
    }

    private animateToValue(property: string, targetValue: number): void {
        const currentValue = this[property as keyof AnalyticsDashboard] as number;
        if (currentValue !== targetValue) {
            const diff = targetValue - currentValue;
            const step = Math.ceil(Math.abs(diff) / 10);
            
            if (property === 'animatedTotal') {
                this.animatedTotal += diff > 0 ? step : -step;
            } else if (property === 'animatedCompleted') {
                this.animatedCompleted += diff > 0 ? step : -step;
            } else if (property === 'animatedInProgress') {
                this.animatedInProgress += diff > 0 ? step : -step;
            } else if (property === 'animatedTodo') {
                this.animatedTodo += diff > 0 ? step : -step;
            }
            this.cdr.detectChanges();
        }
    }

    private animateCounters(): void {
        if (this.taskAnalytics) {
            this.animatedTotal = this.taskAnalytics.totalTasks;
            this.animatedCompleted = this.taskAnalytics.completedTasks;
            this.animatedInProgress = this.taskAnalytics.inProgressTasks;
            this.animatedTodo = this.taskAnalytics.todoTasks;
        }
    }

    get completionRate(): number {
        if (!this.taskAnalytics || this.taskAnalytics.totalTasks === 0) return 0;
        return Math.round((this.taskAnalytics.completedTasks / this.taskAnalytics.totalTasks) * 100);
    }

    get progressRate(): number {
        if (!this.taskAnalytics || this.taskAnalytics.totalTasks === 0) return 0;
        return Math.round((this.taskAnalytics.inProgressTasks / this.taskAnalytics.totalTasks) * 100);
    }

    get todoRate(): number {
        if (!this.taskAnalytics || this.taskAnalytics.totalTasks === 0) return 0;
        return Math.round((this.taskAnalytics.todoTasks / this.taskAnalytics.totalTasks) * 100);
    }

    get priorityData(): { label: string; value: number; color: string; percentage: number }[] {
        if (!this.taskAnalytics) return [];
        
        const total = this.taskAnalytics.highPriorityTasks + 
                      this.taskAnalytics.mediumPriorityTasks + 
                      this.taskAnalytics.lowPriorityTasks;
        
        if (total === 0) return [
            { label: 'High', value: 0, color: '#ef4444', percentage: 0 },
            { label: 'Medium', value: 0, color: '#f59e0b', percentage: 0 },
            { label: 'Low', value: 0, color: '#22c55e', percentage: 0 }
        ];

        return [
            { 
                label: 'High', 
                value: this.taskAnalytics.highPriorityTasks, 
                color: '#ef4444',
                percentage: Math.round((this.taskAnalytics.highPriorityTasks / total) * 100)
            },
            { 
                label: 'Medium', 
                value: this.taskAnalytics.mediumPriorityTasks, 
                color: '#f59e0b',
                percentage: Math.round((this.taskAnalytics.mediumPriorityTasks / total) * 100)
            },
            { 
                label: 'Low', 
                value: this.taskAnalytics.lowPriorityTasks, 
                color: '#22c55e',
                percentage: Math.round((this.taskAnalytics.lowPriorityTasks / total) * 100)
            }
        ];
    }

    get columnData(): { label: string; value: number; color: string }[] {
        if (!this.taskAnalytics || !this.taskAnalytics.tasksByColumn) return [];

        const colors: { [key: string]: string } = {
            'todo': '#3b82f6',
            'inprogress': '#f59e0b',
            'done': '#22c55e'
        };

        return Object.entries(this.taskAnalytics.tasksByColumn).map(([id, count]) => ({
            label: this.formatColumnName(id),
            value: count,
            color: colors[id.toLowerCase()] || '#8b5cf6'
        }));
    }

    formatColumnName(id: string): string {
        return id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    formatDate(date: Date | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    getColumnHeightPercent(columnValue: number): number {
        if (!this.taskAnalytics || this.taskAnalytics.totalTasks === 0) return 0;
        return (columnValue / this.taskAnalytics.totalTasks) * 100;
    }

    getGreeting(): string {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning';
        if (hour < 18) return 'Good Afternoon';
        return 'Good Evening';
    }

    hasTasks(): boolean {
        return this.taskAnalytics !== null && (this.taskAnalytics?.totalTasks ?? 0) > 0;
    }

    getTimeAgo(date: Date): string {
        const now = new Date();
        const diff = now.getTime() - new Date(date).getTime();
        const seconds = Math.floor(diff / 1000);
        
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    }

    getActivityIcon(type: RecentActivity['type']): string {
        switch (type) {
            case 'created': return 'M12 4v16m8-8H4';
            case 'completed': return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
            case 'moved': return 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4';
            case 'deleted': return 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16';
            default: return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
        }
    }

    getActivityColor(type: RecentActivity['type']): string {
        switch (type) {
            case 'created': return 'bg-blue-100 text-blue-600';
            case 'completed': return 'bg-green-100 text-green-600';
            case 'moved': return 'bg-purple-100 text-purple-600';
            case 'deleted': return 'bg-red-100 text-red-600';
            default: return 'bg-gray-100 text-gray-600';
        }
    }

    getArcPath(percent: number, offset: number = 0): string {
        // Convert percentage to SVG arc path
        const radius = 15.9155;
        
        // Adjust for offset
        const adjustedPercent = Math.min(100, Math.max(0, percent));
        
        // Calculate start point (offset around the circle)
        const startAngle = (offset / 100) * 2 * Math.PI - Math.PI / 2;
        const endAngle = startAngle + (adjustedPercent / 100) * 2 * Math.PI;
        
        const x1 = 18 + radius * Math.cos(startAngle);
        const y1 = 18 + radius * Math.sin(startAngle);
        const x2 = 18 + radius * Math.cos(endAngle);
        const y2 = 18 + radius * Math.sin(endAngle);
        
        const largeArcFlag = adjustedPercent > 50 ? 1 : 0;
        
        return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    }
}

