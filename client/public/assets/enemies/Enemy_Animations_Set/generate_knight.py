import sys
try:
    from PIL import Image, ImageDraw
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def draw_knight(draw, x_offset, y_offset, action, frame, total_frames):
    # Base coordinates
    head_box = [x_offset + 12, y_offset + 8, x_offset + 20, y_offset + 16]
    body_box = [x_offset + 10, y_offset + 16, x_offset + 22, y_offset + 26]
    visor_box = [x_offset + 16, y_offset + 10, x_offset + 20, y_offset + 13]
    sword_box = [x_offset + 22, y_offset + 18, x_offset + 28, y_offset + 20]

    if action == 'idle':
        # Bob up and down
        y_bob = 1 if frame % 2 == 0 else 0
        head_box[1] += y_bob; head_box[3] += y_bob
        body_box[1] += y_bob; body_box[3] += y_bob
        visor_box[1] += y_bob; visor_box[3] += y_bob
        sword_box[1] += y_bob; sword_box[3] += y_bob
    elif action == 'movement':
        # Bob more, sword swings
        y_bob = 2 if frame % 2 == 0 else 0
        head_box[1] += y_bob; head_box[3] += y_bob
        body_box[1] += y_bob; body_box[3] += y_bob
        visor_box[1] += y_bob; visor_box[3] += y_bob
        sword_box[1] += y_bob; sword_box[3] += y_bob
        sword_box[2] += (frame % 3)
    elif action == 'attack':
        # Sword thrusts forward
        thrust = (frame / total_frames) * 10
        if frame > total_frames / 2:
            thrust = 10 - thrust
        sword_box[0] += thrust; sword_box[2] += thrust + 5
    elif action == 'take_damage':
        # Flash red (handled by color later) and knock back
        head_box[0] -= 2; head_box[2] -= 2
        body_box[0] -= 2; body_box[2] -= 2
        visor_box[0] -= 2; visor_box[2] -= 2
        sword_box[0] -= 2; sword_box[2] -= 2
    elif action == 'death':
        # Fall over
        fall = min(frame * 2, 14)
        head_box[1] += fall; head_box[3] += fall
        body_box[1] += fall; body_box[3] += fall
        visor_box[1] += fall; visor_box[3] += fall
        sword_box[1] += fall; sword_box[3] += fall

    # Colors
    armor_color = (192, 192, 192, 255) # Silver
    if action == 'take_damage':
        armor_color = (255, 100, 100, 255) # Reddish flash
    elif action == 'death' and frame > total_frames - 2:
        armor_color = (100, 100, 100, 255) # Dark gray

    # Draw
    draw.rectangle(head_box, fill=armor_color)
    draw.rectangle(body_box, fill=(50, 50, 200, 255)) # Blue tunic
    draw.rectangle(visor_box, fill=(0, 0, 0, 255)) # Black visor
    draw.rectangle(sword_box, fill=(200, 200, 200, 255)) # Sword

def create_spritesheet(action, frames, filename):
    width, height = 32 * frames, 32
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    for f in range(frames):
        draw_knight(draw, f * 32, 0, action, f, frames)
        
    img.save(filename)
    print(f"Generated {filename}")

create_spritesheet('idle', 6, 'enemies-knight_idle.png')
create_spritesheet('movement', 10, 'enemies-knight_movement.png')
create_spritesheet('attack', 9, 'enemies-knight_attack.png')
create_spritesheet('take_damage', 5, 'enemies-knight_take_damage.png')
create_spritesheet('death', 10, 'enemies-knight_death.png')

