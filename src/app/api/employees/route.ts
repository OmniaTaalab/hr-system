
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!rawBody || !rawBody.trim()) {
      return NextResponse.json({ message: "Request body is empty." }, { status: 400 });
    }

    let bodyData: any;
    try {
      bodyData = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ message: "Invalid JSON in request body." }, { status: 400 });
    }

    const { apiToken, ...employeeData } = bodyData;

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

    try {
        const jsonResponse = JSON.parse(responseBody);
        return NextResponse.json(jsonResponse, { status: apiResponse.status });
    } catch (e) {
        // If parsing fails, it's likely not JSON (e.g., HTML error page)
        if (!apiResponse.ok) {
            return NextResponse.json({ message: `API call failed: ${responseBody}` }, { status: apiResponse.status });
        }
        return new NextResponse(responseBody, { status: apiResponse.status });
    }

  } catch (error: any) {
    console.error("Error in /api/employees route:", error);
    return NextResponse.json({ message: `Internal Server Error: ${error.message}` }, { status: 500 });
  }
}
