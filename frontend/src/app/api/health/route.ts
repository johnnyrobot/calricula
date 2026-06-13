import { NextResponse } from 'next/server';

/**
 * Health check endpoint for container orchestration and load balancers.
 * Returns a simple JSON response indicating the service is healthy.
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'calricula-frontend',
    timestamp: new Date().toISOString(),
  });
}
