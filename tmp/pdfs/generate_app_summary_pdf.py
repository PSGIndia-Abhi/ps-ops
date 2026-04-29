from pathlib import Path

import fitz
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import simpleSplit
from reportlab.pdfgen import canvas


ROOT = Path(r"C:\Users\abhip\ps-ops-platform-stable")
OUTPUT_DIR = ROOT / "output" / "pdf"
TMP_DIR = ROOT / "tmp" / "pdfs"
PDF_PATH = OUTPUT_DIR / "ps-ops-platform-app-summary.pdf"
PNG_PATH = TMP_DIR / "ps-ops-platform-app-summary-page-1.png"


TITLE = "PS Ops Platform"
SUBTITLE = "Repo-based one-page app summary"

WHAT_IT_IS = (
    "A role-based service operations app for planning, assigning, tracking, "
    "and reviewing field jobs. The repo shows admin, supervisor, technician, "
    "and client workflows backed by an Express API, MySQL, and MinIO."
)

WHO_ITS_FOR = (
    "Primary persona: an operations admin or branch admin running multi-branch "
    "field service delivery."
)

FEATURES = [
    "Create service bookings, including recurring schedules that can auto-generate future jobs.",
    "Manage groups, companies, sites, branches, and site contacts.",
    "Assign supervisors and technicians to work orders and manage supervisor teams.",
    "Track jobs and visits with status changes, comments, approvals, and rescheduling.",
    "Upload and view job attachments and company logos in object storage.",
    "Give clients a portal for job updates, upcoming visits, service requests, and complaints/tickets.",
    "Support login, invite activation, OTP signup, password reset, and role-based access.",
]

ARCHITECTURE = [
    "Frontend: React 19 + Vite + React Router with protected layouts for admin, supervisor, technician, and client roles.",
    "API: Express 5 routes for auth, jobs, bookings, visits, tickets, teams, dashboard, companies, branches, sites, contacts, and attachments.",
    "Data: MySQL via a `mysql2` connection pool; schema evidence exists in `ec2/ps_ops.sql` and SQL migrations under `backend/src/data/migrations`.",
    "Files and notifications: MinIO stores attachments and company logos; Nodemailer sends OTP and ticket emails.",
    "Flow: browser stores JWT -> `apiFetch` sends Bearer token -> backend auth and role middleware checks access -> routes read/write MySQL and MinIO -> UI refreshes from API.",
    "Background and infra: a recurring scheduler creates future jobs from bookings; Docker Compose defines backend, MySQL, MinIO, Redis, and PHPMyAdmin. Redis usage: Not found in repo.",
]

RUN_STEPS = [
    "Start services: `docker compose -f infra/Docker-compose.yml up -d`.",
    "Database bootstrap: import `ec2/ps_ops.sql`. Automated migration/seed command: Not found in repo.",
    "Backend (if not using the Compose backend): in `backend/`, run `npm install` and then `node index.js`.",
    "Frontend: in `frontend/`, run `npm install` and then `npm run dev`.",
    "Open `http://localhost:5173`; dev API base points to `http://localhost:3000` in `frontend/.env`.",
]


def draw_wrapped_text(pdf, text, x, y, width, font_name="Helvetica", font_size=9.6, leading=11.2, color=None):
    if color:
        pdf.setFillColor(color)
    pdf.setFont(font_name, font_size)
    lines = simpleSplit(text, font_name, font_size, width)
    for line in lines:
        pdf.drawString(x, y, line)
        y -= leading
    return y


def draw_bullets(pdf, items, x, y, width, font_size=9.6, leading=11.0, bullet_indent=10):
    pdf.setFont("Helvetica", font_size)
    pdf.setFillColor(HexColor("#1F2937"))
    bullet_x = x
    text_x = x + bullet_indent
    text_width = width - bullet_indent
    for item in items:
        lines = simpleSplit(item, "Helvetica", font_size, text_width)
        pdf.drawString(bullet_x, y, u"\u2022")
        for idx, line in enumerate(lines):
            pdf.drawString(text_x, y, line)
            y -= leading
        y -= 1.5
    return y


def draw_section_heading(pdf, label, x, y):
    pdf.setFillColor(HexColor("#0F172A"))
    pdf.setFont("Helvetica-Bold", 11.2)
    pdf.drawString(x, y, label.upper())
    pdf.setStrokeColor(HexColor("#CBD5E1"))
    pdf.setLineWidth(0.8)
    pdf.line(x, y - 3, 540, y - 3)
    return y - 16


def create_pdf():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    pdf = canvas.Canvas(str(PDF_PATH), pagesize=A4)
    width, height = A4
    margin = 42

    pdf.setTitle("PS Ops Platform - App Summary")

    # Background blocks
    pdf.setFillColor(HexColor("#F8FAFC"))
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    pdf.setFillColor(HexColor("#E2E8F0"))
    pdf.rect(margin, height - 96, width - (margin * 2), 64, stroke=0, fill=1)
    pdf.setFillColor(HexColor("#0F172A"))

    y = height - 58
    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(margin + 14, y, TITLE)
    pdf.setFont("Helvetica", 10.4)
    pdf.setFillColor(HexColor("#334155"))
    pdf.drawString(margin + 14, y - 18, SUBTITLE)

    body_x = margin
    body_width = width - (margin * 2)
    y = height - 118

    y = draw_section_heading(pdf, "What it is", body_x, y)
    y = draw_wrapped_text(pdf, WHAT_IT_IS, body_x, y, body_width, font_size=9.8, leading=11.4, color=HexColor("#1F2937"))
    y -= 6

    y = draw_section_heading(pdf, "Who it's for", body_x, y)
    y = draw_wrapped_text(pdf, WHO_ITS_FOR, body_x, y, body_width, font_size=9.8, leading=11.4, color=HexColor("#1F2937"))
    y -= 6

    y = draw_section_heading(pdf, "What it does", body_x, y)
    y = draw_bullets(pdf, FEATURES, body_x, y, body_width, font_size=9.6, leading=10.8)
    y -= 2

    y = draw_section_heading(pdf, "How it works", body_x, y)
    y = draw_bullets(pdf, ARCHITECTURE, body_x, y, body_width, font_size=9.1, leading=10.3)
    y -= 2

    y = draw_section_heading(pdf, "How to run", body_x, y)
    y = draw_bullets(pdf, RUN_STEPS, body_x, y, body_width, font_size=9.3, leading=10.6)

    pdf.setFont("Helvetica-Oblique", 8.3)
    pdf.setFillColor(HexColor("#64748B"))
    pdf.drawRightString(width - margin, 22, "Generated from repo evidence only")

    pdf.showPage()
    pdf.save()


def render_first_page():
    doc = fitz.open(PDF_PATH)
    page = doc.load_page(0)
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
    pix.save(PNG_PATH)
    doc.close()


if __name__ == "__main__":
    create_pdf()
    render_first_page()
    print(PDF_PATH)
    print(PNG_PATH)
