import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  uploadPreset: string;
}

@Injectable({
  providedIn: 'root'
})
export class CloudinaryService {
  private http = inject(HttpClient);
  private config: CloudinaryConfig = environment.cloudinary;

  private get uploadUrl(): string {
    return `https://api.cloudinary.com/v1_1/${this.config.cloudName}/image/upload`;
  }

  uploadFile(file: File): Observable<string> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.config.uploadPreset);
    formData.append('api_key', this.config.apiKey);
    formData.append('timestamp', Math.round(Date.now() / 1000).toString());

    const headers = new HttpHeaders({
      'X-Requested-With': 'XMLHttpRequest'
    });

    return this.http.post(this.uploadUrl, formData, { headers }).pipe(
      map((response: any) => {
        if (response.secure_url) {
          return response.secure_url;
        }
        throw new Error('Upload failed: No secure_url in response');
      }),
      catchError(error => {
        console.error('Cloudinary upload error:', error);
        throw new Error('File upload failed. Please try again.');
      })
    );
  }

  isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  getFilePreviewUrl(file: File): string {
    return URL.createObjectURL(file);
  }
}
