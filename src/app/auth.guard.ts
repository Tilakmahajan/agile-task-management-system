import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = () => {
    const auth = inject(Auth);
    const router = inject(Router);

    return user(auth).pipe(
        take(1),
        map(firebaseUser => {
            if (firebaseUser) {
                return true;
            } else {
                return router.parseUrl('/login');
            }
        })
    );
};
