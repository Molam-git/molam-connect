/**
 * Simple in-memory job queue
 * For production, replace with BullMQ, Kafka, or RabbitMQ
 */

interface Job {
  id: string;
  type: string;
  data: any;
  runAt?: Date;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

const queue: Job[] = [];
let jobIdCounter = 0;

export async function enqueueJob(type: string, data: any, runAt?: string): Promise<string> {
  const job: Job = {
    id: `job_${Date.now()}_${jobIdCounter++}`,
    type,
    data,
    runAt: runAt ? new Date(runAt) : undefined,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date(),
  };

  queue.push(job);
  console.log(`Enqueued job ${job.id} of type ${type}`);
  return job.id;
}

export function getReadyJobs(): Job[] {
  const now = new Date();
  return queue.filter((job) => {
    if (job.attempts >= job.maxAttempts) return false;
    if (job.runAt && job.runAt > now) return false;
    return true;
  });
}

export function markJobCompleted(jobId: string): void {
  const index = queue.findIndex((j) => j.id === jobId);
  if (index !== -1) {
    queue.splice(index, 1);
  }
}

export function markJobFailed(jobId: string): void {
  const job = queue.find((j) => j.id === jobId);
  if (job) {
    job.attempts++;
    console.error(`Job ${jobId} failed, attempts: ${job.attempts}/${job.maxAttempts}`);
  }
}

export function getQueueSize(): number {
  return queue.length;
}
