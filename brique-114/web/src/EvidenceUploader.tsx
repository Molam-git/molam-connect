/**
 * Brique 114 - SIRA Explainability & Feedback UI
 * Evidence Uploader - Upload files to S3 with presigned URLs
 */

import React, { useState } from "react";

interface Props {
  predictionId: string;
}

export default function EvidenceUploader({ predictionId }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      // 1. Get presigned URL
      const presignRes = await fetch("/api/s3/presign", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type
        })
      });

      const { presigned_url, s3_key } = await presignRes.json();

      // 2. Upload to S3
      const uploadRes = await fetch(presigned_url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type
        },
        body: file
      });

      if (!uploadRes.ok) {
        throw new Error("Upload failed");
      }

      // 3. Compute hash (simplified - in production use proper hashing)
      const fileBuffer = await file.arrayBuffer();
      const hash = await computeHash(fileBuffer);

      // 4. Register evidence
      await fetch("/api/sira/upload_evidence", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({
          feedback_id: "", // Will be set when feedback is created
          s3_key,
          evidence_type: file.type.startsWith("image/") ? "image" : file.type.includes("pdf") ? "pdf" : "text",
          file_hash: hash,
          file_size: file.size,
          content_type: file.type
        })
      });

      setUploadedFiles([...uploadedFiles, file.name]);
      alert("File uploaded successfully");
    } catch (error: any) {
      console.error("Upload failed:", error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function computeHash(buffer: ArrayBuffer): Promise<string> {
    // Simplified - in production use proper SHA-256
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">Evidence</label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
        <input
          type="file"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="evidence-upload"
          accept="image/*,application/pdf,text/*"
        />
        <label
          htmlFor="evidence-upload"
          className="cursor-pointer text-blue-600 hover:text-blue-700"
        >
          {uploading ? "Uploading..." : "Click to upload evidence"}
        </label>
        {uploadedFiles.length > 0 && (
          <div className="mt-2 text-xs text-gray-600">
            Uploaded: {uploadedFiles.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

