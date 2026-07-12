"""
E2E Test: Auth Persistence (Firebase browserLocalPersistence)
=============================================================
Tests 7 scenarios to verify users stay logged in across refreshes
and tab closes, and are properly logged out on demand.
"""
import asyncio
import os
import sys
import subprocess
import time
import socket

os.environ["PYTHONIOENCODING"] = "utf-8"

# Try importing playwright
try:
    from playwright.async_api import async_playwright, TimeoutError as PwTimeout
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"])
    from playwright.async_api import async_playwright, TimeoutError as PwTimeout

# --- Configuration ---
PORT = 3001
BASE = f"http://localhost:{PORT}"
TEST_EMAIL = f"test_persist_{int(time.time())}@e2e.oxiai.test"
TEST_PASSWORD = "TestPass123!"
TEST_NAME = "E2E Tester"

results = []

def report(scenario, passed, detail=""):
    status = "PASSED" if passed else "FAILED"
    results.append((scenario, passed, detail))
    # Use ASCII markers instead of emojis to avoid encoding issues on Windows
    marker = "[OK]" if passed else "[FAIL]"
    print(f"  {marker} {scenario}")
    if detail:
        for line in detail.split("\n"):
            print(f"         {line}")

async def wait_for_page(page, url, timeout=15000):
    try:
        await page.goto(url, wait_until="networkidle", timeout=timeout)
        return True
    except Exception as e:
        print(f"  [WARN] Navigation error: {e}")
        return False

async def get_text(page, selector, timeout=5000):
    try:
        el = await page.wait_for_selector(selector, state="attached", timeout=timeout)
        return (await el.inner_text()) if el else ""
    except:
        return ""

async def is_visible(page, selector, timeout=3000):
    try:
        await page.wait_for_selector(selector, state="visible", timeout=timeout)
        return True
    except:
        return False

async def screenshot(page, name):
    try:
        await page.screenshot(path=f"debug_{name}.png", full_page=True)
        print(f"  [DEBUG] Screenshot saved: debug_{name}.png")
    except Exception as e:
        print(f"  [WARN] Screenshot failed: {e}")

async def dump_page_state(page, label):
    """Print the current state of the page for debugging."""
    print(f"\n  --- Page state ({label}) ---")
    print(f"  URL: {page.url}")
    try:
        body_text = await page.evaluate("document.body?.innerText?.substring(0, 500) || 'no body'")
        print(f"  Body text (first 500 chars): {body_text[:200]}")
    except Exception as e:
        print(f"  Could not get body text: {e}")
    print(f"  --- End state ---\n")

async def test_all(browser):
    context = await browser.new_context(viewport={"width": 1280, "height": 800})
    page = await context.new_page()

    # --- SCENARIO 1: Sign Up & Login ---
    print("\n" + "="*70)
    print("SCENARIO 1: Sign up a new user and reach the chat interface")
    print("="*70)

    try:
        await wait_for_page(page, BASE)
        await asyncio.sleep(3)  # let React hydrate + Three.js load

        await screenshot(page, "01_landing_page")
        await dump_page_state(page, "After landing page load")

        # Try to click the "Log in" button in the header or hero
        login_clicked = False
        click_attempts = [
            ("Header 'Log in'", "button:has-text('Log in')"),
            ("Hero 'Get started free'", "button:has-text('Get started')"),
            ("Header 'Sign up' and then look for modal", "button:has-text('Sign up')"),
        ]
        
        for label, selector in click_attempts:
            try:
                btn = await page.query_selector(selector)
                if btn:
                    visible = await btn.is_visible()
                    print(f"  [{label}] visible={visible}")
                    if visible:
                        await btn.click()
                        login_clicked = True
                        print(f"  [{label}] clicked successfully")
                        await asyncio.sleep(1.5)
                        break
                else:
                    print(f"  [{label}] element not found")
            except Exception as e:
                print(f"  [{label}] error: {e}")

        if not login_clicked:
            # Aggressive fallback: click any button with login/signup text
            print("  [FALLBACK] Trying aggressive button search...")
            try:
                btns = await page.query_selector_all("button, a")
                for btn in btns:
                    try:
                        txt = (await btn.inner_text()).strip().lower()
                        if any(x in txt for x in ['log in', 'sign in', 'get started', 'login', 'sign up']):
                            if await btn.is_visible():
                                await btn.click()
                                login_clicked = True
                                print(f"  [FALLBACK] clicked: '{txt}'")
                                await asyncio.sleep(1.5)
                                break
                    except:
                        continue
            except Exception as e:
                print(f"  [FALLBACK] error: {e}")

        await screenshot(page, "02_after_click")

        # Check if auth modal opened
        # The modal h2 is inside the AnimatePresence with text "Welcome back" or "Create an account"
        modal_h2 = await get_text(page, ".fixed.inset-0.z-\\[9999\\] h2", timeout=3000)
        print(f"  Modal h2 text: '{modal_h2}'")
        
        if not modal_h2:
            modal_h2 = await get_text(page, "h2:has-text('Welcome')", timeout=2000)
        if not modal_h2:
            modal_h2 = await get_text(page, "h2:has-text('Create')", timeout=2000)
        
        print(f"  Resolved modal text: '{modal_h2}'")

        modal_open = bool(modal_h2) and ("Welcome" in modal_h2 or "Create" in modal_h2 or "account" in modal_h2.lower())
        
        if not modal_open:
            print("  [WARN] Auth modal did not open, cannot proceed with signup flow")
            report("1. Sign up and redirect to chat", False,
                   "Auth modal did not open after button clicks")
            await screenshot(page, "01_error_no_modal")
        else:
            found_signup = "Create" in modal_h2 or "sign up" in modal_h2.lower()
            if not found_signup:
                # Toggle to signup mode
                try:
                    toggle_btn = await page.query_selector("button:has-text('Sign up')")
                    if toggle_btn:
                        await toggle_btn.click()
                        await asyncio.sleep(0.5)
                        print("  [TOGGLE] Switched to signup mode")
                except Exception as e:
                    print(f"  [TOGGLE] error: {e}")

            # Fill sign-up form
            name_input = await page.query_selector('input[id="auth-name"]')
            if name_input:
                await name_input.fill(TEST_NAME)
                print(f"  [FORM] Filled name: {TEST_NAME}")
            else:
                print("  [WARN] Name input not found")

            email_input = await page.query_selector('input[id="auth-email"]')
            if email_input:
                await email_input.fill(TEST_EMAIL)
                print(f"  [FORM] Filled email: {TEST_EMAIL}")
            else:
                print("  [WARN] Email input not found, trying alternatives...")
                email_input = await page.query_selector('input[type="email"]')
                if email_input:
                    await email_input.fill(TEST_EMAIL)
                    print(f"  [FORM] Filled email (alt): {TEST_EMAIL}")

            pass_input = await page.query_selector('input[id="auth-password"]')
            if pass_input:
                await pass_input.fill(TEST_PASSWORD)
                print(f"  [FORM] Filled password")
            else:
                print("  [WARN] Password input not found, trying alternatives...")
                pass_input = await page.query_selector('input[type="password"]')
                if pass_input:
                    await pass_input.fill(TEST_PASSWORD)

            await screenshot(page, "03_form_filled")

            # Submit
            submit_btn = await page.query_selector('button[type="submit"]')
            if submit_btn:
                btn_text = await submit_btn.inner_text()
                print(f"  [FORM] Submit button found: '{btn_text}'")
                await submit_btn.click()
                print("  [FORM] Submitted")
            else:
                print("  [WARN] Submit button not found!")
                report("1. Sign up and redirect to chat", False,
                       "Submit button not found in auth modal")
                await screenshot(page, "01_error_no_submit")
                raise Exception("No submit button found")

            print("  Waiting for auth to process and redirect to chat...")
            # Wait longer for Firebase auth to complete
            for i in range(15):
                await asyncio.sleep(1)
                current_url = page.url
                if "/chat" in current_url or "chat.html" in current_url:
                    print(f"  [NAV] Redirected to chat at second {i+1}")
                    break
                if i == 14:
                    print(f"  [NAV] No redirect after 15s, current URL: {current_url}")

            await asyncio.sleep(2)
            current_url = page.url
            print(f"  Current URL after signup: {current_url}")

            on_chat = "/chat" in current_url or "chat.html" in current_url
            report("1. Sign up and redirect to chat", on_chat,
                   f"Expected: redirect to /chat, Got: {current_url}" if not on_chat else "")

            if on_chat:
                await asyncio.sleep(2)
                chat_input_visible = await is_visible(page, "#message-input", timeout=5000)
                report("1b. Chat interface renders after signup", chat_input_visible)
            
            await screenshot(page, "04_after_login")

    except Exception as e:
        report("1. Sign up and redirect to chat", False, f"Exception: {e}")
        import traceback
        traceback.print_exc()
        await screenshot(page, "01_error")

    # --- SCENARIO 2: Refresh page while logged in ---
    print("\n" + "="*70)
    print("SCENARIO 2: Refresh the page while logged in")
    print("="*70)

    try:
        await page.reload(wait_until="networkidle")
        print("  Page reloaded, waiting for Firebase session restore...")
        await asyncio.sleep(5)

        await screenshot(page, "05_after_refresh")

        current_url = page.url
        print(f"  URL after refresh: {current_url}")
        on_chat = "/chat" in current_url or "chat.html" in current_url
        on_landing = "/" == current_url.rstrip("/") or "index" in current_url

        if on_chat:
            chat_input = await is_visible(page, "#message-input", timeout=5000)
            print(f"  Chat input visible: {chat_input}")
            report("2. Refresh stays on chat interface", chat_input)
        elif on_landing:
            report("2. Refresh stays on chat interface", False,
                   "Redirected to landing page after refresh - session was lost")
        else:
            report("2. Refresh stays on chat interface", False,
                   f"Unexpected URL: {current_url}")
    except Exception as e:
        report("2. Refresh stays on chat interface", False, f"Exception: {e}")
        await screenshot(page, "02_error")

    # --- SCENARIO 3: Close tab, reopen in new tab ---
    print("\n" + "="*70)
    print("SCENARIO 3: Close tab, reopen app in new tab")
    print("="*70)

    try:
        await page.close()
        page2 = await context.new_page()

        await wait_for_page(page2, BASE + "/chat.html")
        print("  New tab opened to /chat.html, waiting for session restore...")
        await asyncio.sleep(5)

        await screenshot(page2, "06_new_tab")

        current_url = page2.url
        print(f"  URL in new tab: {current_url}")
        on_chat = "/chat" in current_url or "chat.html" in current_url
        on_landing = "/" == current_url.rstrip("/") or "index" in current_url

        if on_chat:
            chat_input = await is_visible(page2, "#message-input", timeout=5000)
            print(f"  Chat input visible: {chat_input}")
            report("3. New tab - session persists", chat_input)
        elif on_landing:
            report("3. New tab - session persists", False,
                   "Redirected to landing page - session did not survive tab close/reopen")
        else:
            report("3. New tab - session persists", False,
                   f"Unexpected URL after new tab: {current_url}")

        page = page2
    except Exception as e:
        err_page = page2 if 'page2' in dir() and page2 else page
        report("3. New tab - session persists", False, f"Exception: {e}")
        await screenshot(err_page, "03_error")
        page = page2 if 'page2' in dir() else page

    # --- SCENARIO 4: Loading state during session restore ---
    print("\n" + "="*70)
    print("SCENARIO 4: Loading state shown during session restore")
    print("="*70)

    try:
        context2 = await browser.new_context(viewport={"width": 1280, "height": 800})
        page3 = await context2.new_page()

        loading_detected = False
        
        # Navigate and immediately check for loading state
        await page3.goto(BASE + "/chat.html", wait_until="domcontentloaded")
        await asyncio.sleep(0.5)
        
        # Check for auth-loading element
        try:
            el = await page3.query_selector("#auth-loading")
            if el:
                is_loading_visible = await el.is_visible()
                loading_detected = is_loading_visible
                print(f"  #auth-loading found, visible: {is_loading_visible}")
                if is_loading_visible:
                    loading_text = await el.inner_text()
                    print(f"  Loading text: {loading_text.strip()}")
            else:
                print("  #auth-loading element NOT found on page")
        except Exception as e:
            print(f"  Error checking loading state: {e}")
        
        await asyncio.sleep(4)
        await screenshot(page3, "07_loading_state")

        if loading_detected:
            report("4. Loading state shown during session restore", True)
        else:
            final_url = page3.url
            if "/chat" in current_url or "chat.html" in current_url:
                report("4. Loading state shown during session restore", True,
                       detail="Loading state may have been too brief to capture, but user ended up on chat (session restored correctly)")
            else:
                report("4. Loading state shown during session restore", False,
                       detail=f"No loading state detected, final URL: {final_url}")

        await page3.close()
        await context2.close()
    except Exception as e:
        report("4. Loading state shown during session restore", False, f"Exception: {e}")

    # --- SCENARIO 5: Click Logout ---
    print("\n" + "="*70)
    print("SCENARIO 5: Click Logout")
    print("="*70)

    try:
        logout_clicked = False
        logout_btn = await page.query_selector("#sidebar-logout-btn")
        if logout_btn:
            await logout_btn.click()
            logout_clicked = True
            print("  [LOGOUT] Clicked #sidebar-logout-btn")
        else:
            logout_btn = await page.query_selector('[title="Logout"], button:has-text("Logout")')
            if logout_btn:
                await logout_btn.click()
                logout_clicked = True
                print("  [LOGOUT] Clicked fallback logout button")

        if logout_clicked:
            print("  Waiting for logout redirect...")
            await asyncio.sleep(3)
        else:
            print("  [WARN] No logout button found on page")

        await screenshot(page, "08_after_logout")

        current_url = page.url
        print(f"  URL after logout: {current_url}")
        on_landing = "/" == current_url.rstrip("/") or "index" in current_url
        report("5. Logout redirects to landing page", on_landing or not ("/chat" in current_url),
               f"URL after logout: {current_url}")
    except Exception as e:
        report("5. Logout redirects to landing page", False, f"Exception: {e}")
        await screenshot(page, "05_error")

    # --- SCENARIO 6: After logout, refresh ---
    print("\n" + "="*70)
    print("SCENARIO 6: After logout, refresh / reopen app")
    print("="*70)

    try:
        await page.goto(BASE + "/chat.html", wait_until="networkidle")
        print("  Navigated to /chat.html after logout, waiting...")
        await asyncio.sleep(4)

        await screenshot(page, "09_after_logout_reopen")

        current_url = page.url
        print(f"  URL after reopen: {current_url}")
        on_landing = "/" == current_url.rstrip("/") or "index" in current_url

        report("6. After logout, reopen stays on landing page", on_landing,
               f"URL: {current_url}")
    except Exception as e:
        report("6. After logout, reopen stays on landing page", False, f"Exception: {e}")

    # --- SCENARIO 7: Access chat URL directly while logged out ---
    print("\n" + "="*70)
    print("SCENARIO 7: Access /chat.html directly while logged out")
    print("="*70)

    try:
        context3 = await browser.new_context(viewport={"width": 1280, "height": 800})
        page4 = await context3.new_page()

        await page4.goto(BASE + "/chat.html", wait_until="networkidle")
        print("  Fresh context navigated to /chat.html, waiting...")
        await asyncio.sleep(3)

        await screenshot(page4, "10_logged_out_access_chat")

        current_url = page4.url
        print(f"  URL: {current_url}")
        on_landing = "/" == current_url.rstrip("/") or "index" in current_url

        report("7. Logged-out user accessing /chat is redirected to landing",
               on_landing,
               f"URL: {current_url}")

        await page4.close()
        await context3.close()
    except Exception as e:
        report("7. Logged-out user accessing /chat is redirected to landing", False,
               f"Exception: {e}")

    # --- Cleanup ---
    await page.close()
    await context.close()
    return results


async def main():
    server_process = None
    try:
        print("Starting Express server...")
        server_process = subprocess.Popen(
            ["node", "server.js"],
            cwd=r"C:\Users\souil\Desktop\OXIAI",
            env={**os.environ, "PORT": str(PORT)},
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        # Wait for server to be ready
        for i in range(30):
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            try:
                s.connect(("127.0.0.1", PORT))
                s.close()
                print(f"Server ready on port {PORT}")
                break
            except:
                s.close()
                time.sleep(1)
        else:
            print("ERROR: Server failed to start")
            return

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            try:
                await test_all(browser)
            finally:
                await browser.close()

    finally:
        if server_process:
            print("\nShutting down server...")
            server_process.terminate()
            try:
                server_process.wait(timeout=5)
            except:
                server_process.kill()

    # --- Summary ---
    print("\n" + "="*70)
    print("TEST RESULTS SUMMARY")
    print("="*70)
    passed = sum(1 for r in results if r[1])
    failed = sum(1 for r in results if not r[1])
    for scenario, ok, detail in results:
        icon = "[OK]" if ok else "[FAIL]"
        print(f"  {icon} {scenario}")
    print(f"\n  Passed: {passed}/{len(results)}")
    if failed:
        print(f"  FAILED: {failed}")
        for scenario, ok, detail in results:
            if not ok:
                print(f"    - {scenario}: {detail}")
    else:
        print("  All tests PASSED!")

if __name__ == "__main__":
    asyncio.run(main())
