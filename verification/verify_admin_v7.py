import asyncio
import json
import os
from playwright.async_api import async_playwright

async def verify_admin():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context()

        # Inject tokens before any script runs
        await context.add_init_script("""
            localStorage.setItem('auth_token', 'mock-admin-token');
            localStorage.setItem('auth_refresh_token', 'mock-refresh-token');
        """)

        page = await context.new_page()

        # Mock /api/auth/me
        await page.route("**/api/auth/me", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "user": {
                    "id": "admin-id",
                    "email": "admin@example.com",
                    "name": "Admin User",
                    "role": "admin"
                }
            })
        ))

        # Mock /api/admin/stats
        await page.route("**/api/admin/stats", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "totalUsers": 150,
                "activeUsers": 45,
                "totalProjects": 320,
                "totalTemplates": 85
            })
        ))

        # Mock /api/admin/users
        await page.route("**/api/admin/users*", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "users": [
                    {
                        "id": "1",
                        "name": "John Doe",
                        "email": "john@example.com",
                        "role": "user",
                        "plan": "free",
                        "lastActiveAt": "2023-10-25T10:00:00Z",
                        "createdAt": "2023-01-01T00:00:00Z"
                    },
                    {
                        "id": "2",
                        "name": "Admin Jane",
                        "email": "jane@admin.com",
                        "role": "admin",
                        "plan": "premium",
                        "lastActiveAt": "2023-10-26T12:00:00Z",
                        "createdAt": "2023-01-02T00:00:00Z"
                    }
                ],
                "pagination": {
                    "total": 2,
                    "pages": 1,
                    "page": 1,
                    "limit": 10
                }
            })
        ))

        print("Navigating to Admin Dashboard...")
        # Use HashRouter path
        await page.goto("http://localhost:5173/#/admin")

        # Wait for some content that should be in the dashboard
        try:
            await page.wait_for_selector("text=Admin Dashboard", timeout=10000)
            await page.wait_for_selector("text=Total Users", timeout=5000)
            await page.wait_for_selector("text=150", timeout=5000)
            print("Dashboard loaded successfully!")
        except Exception as e:
            print(f"Failed to load dashboard: {e}")
            # Take a screenshot to see what's happening
            os.makedirs("verification/screenshots", exist_ok=True)
            await page.screenshot(path="verification/screenshots/admin_dashboard_failed_v7.png", full_page=True)
            print("Saved screenshot to verification/screenshots/admin_dashboard_failed_v7.png")
            await browser.close()
            return

        # Take a success screenshot
        os.makedirs("verification/screenshots", exist_ok=True)
        await page.screenshot(path="verification/screenshots/admin_dashboard_success.png", full_page=True)
        print("Saved success screenshot to verification/screenshots/admin_dashboard_success.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(verify_admin())
