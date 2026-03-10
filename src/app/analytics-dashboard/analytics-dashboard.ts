import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { AnalyticsService, TaskAnalytics, UserActivity } from '../services/analytics.service';

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
    
    user$ = this.authService.user$;
    analytics$ = this.analyticsService.analytics$;

    taskAnalytics: TaskAnalytics | null = null;
    userActivity: UserActivity | null = null;
    isLoading = true;
    currentDate = new Date();

    private subscriptions: Subscription[] = [];

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
        this.loadAnalytics();
        
        this.subscriptions.push(
            this.analytics$.subscribe(analytics => {
                this.taskAnalytics = analytics;
            })
        );
    }

    ngOnDestroy(): void {
        this.subscriptions.forEach(sub => sub.unsubscribe());
    }

    async loadAnalytics(): Promise<void> {
        this.isLoading = true;
        
        try {
            // Use Promise.all for parallel execution with a timeout
            const timeoutPromise = new Promise<void>((resolve) => {
                setTimeout(() => {
                    console.log('Analytics load timeout - using cached data');
                    resolve();
                }, 3000); // 3 second timeout
            });

            const fetchPromise = (async () => {
                // Try to get from Firestore first
                const [analytics, activity] = await Promise.all([
                    this.analyticsService.getBoardAnalytics(),
                    this.analyticsService.getUserActivity()
                ]);
                
                this.taskAnalytics = analytics;
                this.userActivity = activity;
            })();

            await Promise.race([fetchPromise, timeoutPromise]);
            
            // If still no data, use default analytics as fallback
            if (!this.taskAnalytics) {
                this.taskAnalytics = this.defaultAnalytics;
            }
        } catch (error) {
            console.error('Error loading analytics:', error);
            // Use default data on error
            this.taskAnalytics = this.defaultAnalytics;
        } finally {
            this.isLoading = false;
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
            'todo': '#6366f1',
            'inProgress': '#f59e0b',
            'done': '#22c55e'
        };

        return Object.entries(this.taskAnalytics.tasksByColumn).map(([id, count]) => ({
            label: this.formatColumnName(id),
            value: count,
            color: colors[id] || '#8b5cf6'
        }));
    }

    get priorityChartHeight(): string {
        if (!this.taskAnalytics) return '0%';
        const max = Math.max(
            this.taskAnalytics.highPriorityTasks,
            this.taskAnalytics.mediumPriorityTasks,
            this.taskAnalytics.lowPriorityTasks,
            1
        );
        return max + 'px';
    }

    formatColumnName(id: string): string {
        return id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    formatDate(date: Date | undefined): string {
        if (!date) return 'N/A';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
        if (!this.taskAnalytics || this.taskAnalytics.totalTasks === 0) return 0;
        return (columnValue / this.taskAnalytics.totalTasks) * 100;
    }

    hasTasks(): boolean {
        return this.taskAnalytics !== null && (this.taskAnalytics?.totalTasks ?? 0) > 0;
    }
}

