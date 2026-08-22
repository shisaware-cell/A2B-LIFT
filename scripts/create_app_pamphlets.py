#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
TEMP_DIR = ROOT / "tmp" / "pdfs" / "a2b-pamphlets"

DRIVER_URL = "https://a2blift.com/download/driver"
CLIENT_URL = "https://a2blift.com/download/client"

PAGE_W, PAGE_H = A5
MARGIN = 13 * mm

BLACK = HexColor("#080A0C")
INK = HexColor("#111315")
MUTED = HexColor("#62676D")
OFF_WHITE = HexColor("#F4F4F0")
SOFT_WHITE = HexColor("#FCFCF9")
GREEN = HexColor("#55C878")
LIME = HexColor("#C9F269")
GOLD = HexColor("#D6B46B")


def register_fonts() -> None:
    regular = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
    bold = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    pdfmetrics.registerFont(TTFont("A2B-Regular", str(regular)))
    pdfmetrics.registerFont(TTFont("A2B-Bold", str(bold)))


def fit_image(source: Path, size: tuple[int, int], destination: Path, *, darken: float = 1.0) -> Path:
    image = Image.open(source).convert("RGB")
    src_ratio = image.width / image.height
    dst_ratio = size[0] / size[1]

    if src_ratio > dst_ratio:
        crop_width = round(image.height * dst_ratio)
        left = max(0, (image.width - crop_width) // 2)
        image = image.crop((left, 0, left + crop_width, image.height))
    else:
        crop_height = round(image.width / dst_ratio)
        top = max(0, (image.height - crop_height) // 2)
        image = image.crop((0, top, image.width, top + crop_height))

    image = image.resize(size, Image.Resampling.LANCZOS)
    if darken != 1.0:
        image = ImageEnhance.Brightness(image).enhance(darken)
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, quality=94, optimize=True)
    return destination


def prepare_icon(source: Path, destination: Path) -> Path:
    icon = Image.open(source).convert("RGBA")
    side = min(icon.size)
    left = (icon.width - side) // 2
    top = (icon.height - side) // 2
    icon = icon.crop((left, top, left + side, top + side)).resize((720, 720), Image.Resampling.LANCZOS)

    mask = Image.new("L", icon.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((0, 0, icon.width - 1, icon.height - 1), radius=150, fill=255)
    icon.putalpha(ImageChops.multiply(icon.getchannel("A"), mask))
    destination.parent.mkdir(parents=True, exist_ok=True)
    icon.save(destination)
    return destination


def draw_cover_image(canvas: Canvas, image_path: Path, x: float, y: float, width: float, height: float) -> None:
    canvas.drawImage(str(image_path), x, y, width=width, height=height, mask="auto")


def draw_text_with_spacing(
    canvas: Canvas,
    text: str,
    x: float,
    y: float,
    *,
    font: str,
    size: float,
    color: Color,
    spacing: float = 0,
) -> None:
    text_obj = canvas.beginText(x, y)
    text_obj.setFont(font, size)
    text_obj.setFillColor(color)
    text_obj.setCharSpace(spacing)
    text_obj.textLine(text)
    canvas.drawText(text_obj)


def draw_brand(canvas: Canvas, icon_path: Path, brand: str, descriptor: str, *, light: bool = True) -> None:
    icon_size = 12 * mm
    icon_y = PAGE_H - MARGIN - icon_size
    canvas.drawImage(str(icon_path), MARGIN, icon_y, width=icon_size, height=icon_size, mask="auto")

    text_color = white if light else INK
    draw_text_with_spacing(
        canvas,
        brand,
        MARGIN + icon_size + 4 * mm,
        PAGE_H - MARGIN - 4.8 * mm,
        font="A2B-Bold",
        size=12.5,
        color=text_color,
        spacing=0.15,
    )
    draw_text_with_spacing(
        canvas,
        descriptor,
        MARGIN + icon_size + 4 * mm,
        PAGE_H - MARGIN - 9.5 * mm,
        font="A2B-Bold",
        size=5.6,
        color=Color(text_color.red, text_color.green, text_color.blue, alpha=0.75),
        spacing=1.15,
    )


def draw_multiline(
    canvas: Canvas,
    lines: list[str],
    x: float,
    y: float,
    *,
    font: str,
    size: float,
    leading: float,
    color: Color,
    spacing: float = 0,
) -> None:
    text_obj = canvas.beginText(x, y)
    text_obj.setFont(font, size)
    text_obj.setFillColor(color)
    text_obj.setLeading(leading)
    text_obj.setCharSpace(spacing)
    for line in lines:
        text_obj.textLine(line)
    canvas.drawText(text_obj)


def draw_feature(canvas: Canvas, x: float, center_y: float, title: str, *, dark: bool) -> None:
    text_color = SOFT_WHITE if dark else INK
    font_size = 8.6
    face = pdfmetrics.getFont("A2B-Bold").face
    baseline_offset = ((face.ascent + face.descent) / 2000) * font_size
    canvas.setStrokeColor(GREEN if dark else HexColor("#27965C"))
    canvas.setLineWidth(1.7)
    canvas.circle(x + 2.3 * mm, center_y, 2.3 * mm, stroke=1, fill=0)
    canvas.line(x + 1.2 * mm, center_y, x + 2.0 * mm, center_y - 0.8 * mm)
    canvas.line(x + 2.0 * mm, center_y - 0.8 * mm, x + 3.5 * mm, center_y + 0.8 * mm)
    draw_text_with_spacing(
        canvas,
        title,
        x + 8 * mm,
        center_y - baseline_offset,
        font="A2B-Bold",
        size=font_size,
        color=text_color,
    )


def draw_qr(canvas: Canvas, value: str, x: float, y: float, container_size: float) -> None:
    canvas.setFillColor(white)
    canvas.roundRect(x, y, container_size, container_size, 2.5 * mm, stroke=0, fill=1)

    padding = 4 * mm
    qr_size = container_size - (2 * padding)
    qr = QrCodeWidget(value, barLevel="H")
    bounds = qr.getBounds()
    qr_width = bounds[2] - bounds[0]
    qr_height = bounds[3] - bounds[1]
    drawing = Drawing(qr_size, qr_size, transform=[qr_size / qr_width, 0, 0, qr_size / qr_height, 0, 0])
    drawing.add(qr)
    renderPDF.draw(drawing, canvas, x + padding, y + padding)


def draw_store_badges(canvas: Canvas, apple_badge: Path, google_badge: Path, x: float, y: float) -> None:
    badge_w = 18.3 * mm
    badge_h = badge_w * (45 / 150)
    gap = 1.4 * mm
    canvas.drawImage(str(apple_badge), x, y, width=badge_w, height=badge_h, mask="auto")
    canvas.drawImage(
        str(google_badge),
        x + badge_w + gap,
        y,
        width=badge_w,
        height=badge_h,
        mask="auto",
    )


def draw_driver_pamphlet(
    output_path: Path,
    vehicle: Path,
    icon: Path,
    apple_badge: Path,
    google_badge: Path,
) -> None:
    canvas = Canvas(str(output_path), pagesize=A5)
    canvas.setTitle("A2B LIFT DRIVER - Download Pamphlet")
    canvas.setAuthor("A2B LIFT")

    hero_h = 115 * mm
    hero_y = PAGE_H - hero_h
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    draw_brand(canvas, icon, "A2B LIFT DRIVER", "DRIVER PARTNER APP", light=True)
    vehicle_w = 132 * mm
    vehicle_h = vehicle_w * (578 / 1140)
    canvas.drawImage(
        str(vehicle),
        (PAGE_W - vehicle_w) / 2,
        hero_y + 20 * mm,
        width=vehicle_w,
        height=vehicle_h,
        mask="auto",
    )
    draw_multiline(
        canvas,
        ["MAKE EVERY", "KILOMETRE COUNT."],
        MARGIN,
        hero_y + 19 * mm,
        font="A2B-Bold",
        size=21.5,
        leading=22,
        color=white,
    )

    body_top = hero_y - 10 * mm
    draw_text_with_spacing(
        canvas,
        "DRIVE WITH A2B",
        MARGIN,
        body_top,
        font="A2B-Bold",
        size=6.5,
        color=LIME,
        spacing=1.2,
    )
    draw_multiline(
        canvas,
        ["More control.", "Clearer earning opportunities."],
        MARGIN,
        body_top - 8 * mm,
        font="A2B-Bold",
        size=15,
        leading=17,
        color=SOFT_WHITE,
    )

    feature_y = body_top - 30 * mm
    draw_feature(canvas, MARGIN, feature_y, "Choose when you drive", dark=True)
    draw_feature(canvas, MARGIN, feature_y - 10 * mm, "Review trips before accepting", dark=True)
    draw_feature(canvas, MARGIN, feature_y - 20 * mm, "Track earnings in one place", dark=True)

    qr_size = 39 * mm
    qr_x = PAGE_W - MARGIN - qr_size
    qr_y = 14 * mm

    draw_text_with_spacing(
        canvas,
        "START DRIVING",
        qr_x,
        qr_y + qr_size + 6 * mm,
        font="A2B-Bold",
        size=10.5,
        color=SOFT_WHITE,
    )
    draw_qr(canvas, DRIVER_URL, qr_x, qr_y, qr_size)
    draw_store_badges(canvas, apple_badge, google_badge, qr_x + 0.5 * mm, 5.5 * mm)

    canvas.showPage()
    canvas.save()


def draw_client_pamphlet(
    output_path: Path,
    hero: Path,
    icon: Path,
    apple_badge: Path,
    google_badge: Path,
) -> None:
    canvas = Canvas(str(output_path), pagesize=A5)
    canvas.setTitle("A2B LIFT - Rider App Download Pamphlet")
    canvas.setAuthor("A2B LIFT")

    hero_h = 108 * mm
    hero_y = PAGE_H - hero_h
    canvas.setFillColor(OFF_WHITE)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    draw_cover_image(canvas, hero, 0, hero_y, PAGE_W, hero_h)

    canvas.saveState()
    canvas.setFillColor(Color(0.02, 0.025, 0.03, alpha=0.44))
    canvas.rect(0, hero_y, PAGE_W, hero_h, stroke=0, fill=1)
    canvas.restoreState()

    draw_brand(canvas, icon, "A2B LIFT", "RIDER APP", light=True)
    draw_multiline(
        canvas,
        ["THE CITY,", "ON YOUR TERMS."],
        MARGIN,
        hero_y + 25 * mm,
        font="A2B-Bold",
        size=24,
        leading=24.5,
        color=white,
    )
    draw_text_with_spacing(
        canvas,
        "Book the right ride for every occasion.",
        MARGIN,
        hero_y + 8.5 * mm,
        font="A2B-Regular",
        size=9.4,
        color=HexColor("#EFF0EC"),
    )

    body_top = hero_y - 11 * mm
    draw_text_with_spacing(
        canvas,
        "RIDE WITH A2B",
        MARGIN,
        body_top,
        font="A2B-Bold",
        size=6.5,
        color=HexColor("#1E8250"),
        spacing=1.2,
    )
    draw_multiline(
        canvas,
        ["Your ride.", "Ready when you are."],
        MARGIN,
        body_top - 8 * mm,
        font="A2B-Bold",
        size=15,
        leading=17,
        color=INK,
    )

    feature_y = body_top - 30 * mm
    draw_feature(canvas, MARGIN, feature_y, "Upfront fare estimates", dark=False)
    draw_feature(canvas, MARGIN, feature_y - 10 * mm, "Live driver and trip tracking", dark=False)
    draw_feature(canvas, MARGIN, feature_y - 20 * mm, "A ride option for every occasion", dark=False)

    qr_size = 39 * mm
    qr_x = PAGE_W - MARGIN - qr_size
    qr_y = 14 * mm

    draw_text_with_spacing(
        canvas,
        "BOOK YOUR RIDE",
        qr_x,
        qr_y + qr_size + 6 * mm,
        font="A2B-Bold",
        size=10.5,
        color=INK,
    )
    draw_qr(canvas, CLIENT_URL, qr_x, qr_y, qr_size)
    draw_store_badges(canvas, apple_badge, google_badge, qr_x + 0.5 * mm, 5.5 * mm)

    canvas.showPage()
    canvas.save()


def main() -> None:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TEMP_DIR.mkdir(parents=True, exist_ok=True)

    client_hero = fit_image(
        ROOT / "website" / "assets" / "images" / "lift-club-hero.jpg",
        (1776, 1296),
        TEMP_DIR / "client-hero.jpg",
        darken=0.82,
    )
    driver_icon = prepare_icon(
        ROOT / "assets" / "images" / "driver-icon.png",
        TEMP_DIR / "driver-icon.png",
    )
    client_icon = prepare_icon(
        ROOT / "assets" / "images" / "icon.png",
        TEMP_DIR / "client-icon.png",
    )

    draw_driver_pamphlet(
        OUTPUT_DIR / "A2B-Lift-Driver-Pamphlet.pdf",
        ROOT / "assets" / "images" / "category-v-class.png",
        driver_icon,
        ROOT / "website" / "assets" / "apple.webp",
        ROOT / "website" / "assets" / "google.webp",
    )
    draw_client_pamphlet(
        OUTPUT_DIR / "A2B-Lift-Client-Pamphlet.pdf",
        client_hero,
        client_icon,
        ROOT / "website" / "assets" / "apple.webp",
        ROOT / "website" / "assets" / "google.webp",
    )


if __name__ == "__main__":
    main()
