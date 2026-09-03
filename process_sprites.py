import os
import glob
from PIL import Image

def process_sprites():
    src_dir = os.path.expanduser("~/Downloads")
    dest_dir = "client/public/assets/enemies/Enemy_Animations_Set"
    
    actions = {
        "idle": ("knight_idle_*.png", "enemies-knight_idle.png"),
        "movement": ("knight_walk_*.png", "enemies-knight_movement.png"),
        "attack": ("knight_attack_*.png", "enemies-knight_attack.png"),
        "take_damage": ("knight_take_damage_*.png", "enemies-knight_take_damage.png"),
        "death": ("knight_death_*.png", "enemies-knight_death.png")
    }

    # First pass: find max dimensions
    max_w = 0
    max_h = 0
    for pattern, _ in actions.values():
        files = glob.glob(os.path.join(src_dir, pattern))
        for f in files:
            with Image.open(f) as img:
                w, h = img.size
                if w > max_w: max_w = w
                if h > max_h: max_h = h

    # Make it a square
    side = max(max_w, max_h)
    print(f"Max original dimension: {side}x{side}")
    
    # Target size for game
    target_size = (32, 32)
    
    for action, (pattern, output_name) in actions.items():
        # Using numerical sorting for the glob results to keep frames in order
        files = glob.glob(os.path.join(src_dir, pattern))
        
        # Simple extraction of numbers to sort correctly (e.g., knight_idle_1.png -> 1)
        import re
        def extract_num(path):
            m = re.search(r'_(\d+)\.png$', path)
            return int(m.group(1)) if m else 0
            
        files = sorted(files, key=extract_num)
        
        if not files:
            print(f"No files found for {action}")
            continue
            
        print(f"Processing {action} ({len(files)} frames)...")
        
        # Create a spritesheet image
        sheet_width = target_size[0] * len(files)
        sheet_height = target_size[1]
        spritesheet = Image.new("RGBA", (sheet_width, sheet_height), (0, 0, 0, 0))
        
        for i, f in enumerate(files):
            with Image.open(f) as img:
                img = img.convert("RGBA")
                
                # Create a padded square image
                padded = Image.new("RGBA", (side, side), (0, 0, 0, 0))
                
                # Center the image horizontally, align bottom so feet stay planted
                x = (side - img.width) // 2
                y = (side - img.height)  # Align bottom
                padded.paste(img, (x, y))
                
                # Resize to target
                # If the image was originally pixel art scaled up, NEAREST might look best.
                # If it's a smooth image, LANCZOS would look better when scaling down.
                # Let's use LANCZOS since it's an AI generated image scaled down from very large.
                resized = padded.resize(target_size, Image.LANCZOS)
                
                # Paste into spritesheet
                spritesheet.paste(resized, (i * target_size[0], 0))
                
        output_path = os.path.join(dest_dir, output_name)
        spritesheet.save(output_path)
        print(f"Saved {output_path}")

if __name__ == "__main__":
    process_sprites()
