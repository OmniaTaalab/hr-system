
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { apiToken, ...employeeData } = await request.json();

    if (!apiToken) {
      return NextResponse.json({ message: "API token is missing." }, { status: 401 });
    }

    const apiResponse = await fetch('https://blb-staging-hwnidclrba-uc.a.run.app/employees', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify(employeeData),
    });

    const responseBody = await apiResponse.text();

    if (!apiResponse.ok) {
      // Forward the error from the external API
      return NextResponse.json({ message: `API call failed: ${responseBody}` }, { status: apiResponse.status });
    }

    // Forward the successful response
    return NextResponse.json(JSON.parse(responseBody || '{}'), { status: apiResponse.status });

  } catch (error: any) {
    console.error("Error in /api/employees route:", error);
    return NextResponse.json({ message: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
