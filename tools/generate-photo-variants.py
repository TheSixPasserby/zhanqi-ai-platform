# -*- coding: utf-8 -*-
"""
从现有实景照片裁出第 2、3 张图集变体（-p2 / -p3）。

为什么用裁切而不是另找图：演示机离线、不能联网下图。同一张实拍照片的不同取景
在详情页里是明显不同的画面，且仍对应该点位/商品，不为凑数放无关图。

用法：python tools/generate-photo-variants.py
依赖：Pillow（仅生成素材时需要，运行时不依赖）
生产改造点：换成摄影师实拍多角度图后，本脚本可删除，只改 seed-gallery.sql 的 images 数组。
"""
import os, glob
from PIL import Image, ImageEnhance

SRC = os.path.join(os.path.dirname(__file__), '..', 'server', 'src', 'main', 'resources',
                   'static', 'assets', 'img', 'photos')


def crop_scale(im, box_ratio, out_w=1000, bright=1.0, warm=0.0):
    w, h = im.size
    x0, y0, x1, y1 = box_ratio
    out = im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    ratio = out_w / out.width
    out = out.resize((out_w, max(1, int(out.height * ratio))), Image.LANCZOS)
    if bright != 1.0:
        out = ImageEnhance.Brightness(out).enhance(bright)
    if warm:
        out = ImageEnhance.Color(out).enhance(1.0 + warm)
    return out


def main():
    made = 0
    for f in sorted(glob.glob(os.path.join(SRC, '*.jpg'))):
        base = os.path.splitext(os.path.basename(f))[0]
        if base.endswith('-p2') or base.endswith('-p3'):
            continue
        im = Image.open(f).convert('RGB')
        out2 = os.path.join(SRC, base + '-p2.jpg')
        if not os.path.exists(out2):
            crop_scale(im, (0.14, 0.10, 0.86, 0.90), 1000, 1.03, 0.04).save(out2, 'JPEG', quality=82, optimize=True)
            made += 1
        out3 = os.path.join(SRC, base + '-p3.jpg')
        if not os.path.exists(out3):
            crop_scale(im, (0.0, 0.16, 0.72, 1.0), 1000, 1.06, 0.10).save(out3, 'JPEG', quality=82, optimize=True)
            made += 1
    print('generated', made, 'variants')


if __name__ == '__main__':
    main()