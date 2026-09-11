import os
from PIL import Image, ImageDraw, ImageFont

os.makedirs('public/samples', exist_ok=True)

W, H = 800, 1100

def create_base_paper():
    # Light cream/off-white exam answer booklet paper
    img = Image.new('RGB', (W, H), color='#fbfaf5')
    draw = ImageDraw.Draw(img)

    # Ruled light blue lines
    for y in range(120, H - 40, 28):
        draw.line([(0, y), (W, y)], fill='#e2e8f0', width=1)

    # Vertical pink/red left margin line
    margin_x = 130
    draw.line([(margin_x, 0), (margin_x, H)], fill='#fca5a5', width=2)

    # Top header bar (KTU Booklet details)
    draw.rectangle([(0, 0), (W, 90)], fill='#f1f5f9')
    draw.line([(0, 90), (W, 90)], fill='#cbd5e1', width=2)
    draw.text((30, 20), "APJ ABDUL KALAM TECHNOLOGICAL UNIVERSITY", fill='#1e293b')
    draw.text((30, 45), "B.Tech Degree Examination - Answer Booklet (Part A / B)", fill='#475569')
    draw.text((580, 25), "Reg No: TVE21CS042", fill='#0f172a')
    draw.text((580, 50), "Course: CS301 (Theory)", fill='#0f172a')

    return img, draw, margin_x

# 1. Sample 1: The Flowchart Masterpiece
img1, draw1, mx1 = create_base_paper()
# Q1 anchor
draw1.text((45, 145), "Q1.(a)", fill='#1e3a8a')
# Short intro lines
for i in range(2):
    y = 145 + i * 28
    draw1.line([(mx1 + 20, y + 15), (mx1 + 450, y + 15)], fill='#1e293b', width=3)

# Big flowchart box 1 (Client)
draw1.rectangle([(mx1 + 30, 230), (mx1 + 180, 290)], outline='#0f172a', width=3)
draw1.text((mx1 + 55, 250), "[ CLIENT UI ]", fill='#0f172a')

# Arrow 1
draw1.line([(mx1 + 180, 260), (mx1 + 250, 260)], fill='#0f172a', width=3)
draw1.polygon([(mx1 + 250, 260), (mx1 + 240, 255), (mx1 + 240, 265)], fill='#0f172a')

# Flowchart box 2 (Load Balancer)
draw1.rectangle([(mx1 + 250, 220), (mx1 + 420, 300)], outline='#0f172a', width=3)
draw1.text((mx1 + 270, 250), "[ LOAD BALANCER ]", fill='#0f172a')

# Arrow 2
draw1.line([(mx1 + 420, 260), (mx1 + 480, 260)], fill='#0f172a', width=3)
draw1.polygon([(mx1 + 480, 260), (mx1 + 470, 255), (mx1 + 470, 265)], fill='#0f172a')

# Flowchart box 3 (Cluster Server)
draw1.rectangle([(mx1 + 480, 220), (mx1 + 630, 300)], outline='#0f172a', width=3)
draw1.text((mx1 + 500, 250), "[ DB CLUSTER ]", fill='#0f172a')

# Q2 anchor
draw1.text((45, 380), "Q2.", fill='#1e3a8a')
# Text lines
for i in range(3):
    y = 380 + i * 28
    draw1.line([(mx1 + 20, y + 15), (mx1 + 580, y + 15)], fill='#1e293b', width=3)

# Diagram box 4
draw1.rectangle([(mx1 + 80, 480), (mx1 + 450, 620)], outline='#0f172a', width=3)
draw1.text((mx1 + 120, 540), "CIRCUIT / PIPELINE DIAGRAM", fill='#0f172a')
draw1.line([(mx1 + 100, 580), (mx1 + 430, 580)], fill='#0f172a', width=2)

# Closing lines
for i in range(4):
    y = 660 + i * 28
    draw1.line([(mx1 + 20, y + 15), (mx1 + 600, y + 15)], fill='#1e293b', width=3)

img1.save('public/samples/sample1_flowchart.png')
print("Sample 1 generated")

# 2. Sample 2: The Sheet Filler (Wall-to-wall handwriting simulation)
img2, draw2, mx2 = create_base_paper()
# Q1
draw2.text((45, 140), "Q1.", fill='#1e3a8a')
for i in range(11):
    y = 140 + i * 28
    draw2.line([(mx2 + 15, y + 15), (W - 35, y + 15)], fill='#1e293b', width=3)

# Q2
draw2.text((45, 480), "Q2.(a)", fill='#1e3a8a')
for i in range(10):
    y = 480 + i * 28
    draw2.line([(mx2 + 15, y + 15), (W - 25, y + 15)], fill='#1e293b', width=3)

# Q3
draw2.text((45, 790), "Q3.", fill='#1e3a8a')
for i in range(9):
    y = 790 + i * 28
    draw2.line([(mx2 + 15, y + 15), (W - 40, y + 15)], fill='#1e293b', width=3)

img2.save('public/samples/sample2_dense_filler.png')
print("Sample 2 generated")

# 3. Sample 3: The Half-Page Despair
img3, draw3, mx3 = create_base_paper()
draw3.text((45, 140), "Q1.", fill='#1e3a8a')
for i in range(3):
    y = 140 + i * 28
    draw3.line([(mx2 + 15, y + 15), (mx2 + 350, y + 15)], fill='#1e293b', width=3)

draw3.text((mx3 + 20, 260), "// Sir please pass me, 39 marks mathi, supply quota venda :'(", fill='#94a3b8')

img3.save('public/samples/sample3_half_page.png')
print("Sample 3 generated")
