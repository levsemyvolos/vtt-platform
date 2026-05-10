/** Upload a file to a presigned URL via XHR so upload progress is trackable. */
export function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e): void => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = (): void => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`GCS upload failed: ${xhr.status} ${xhr.statusText}`));
      }
    };
    xhr.onerror = (): void => reject(new Error('GCS upload network error'));
    xhr.send(file);
  });
}
