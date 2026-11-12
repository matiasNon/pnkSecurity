'use strict';
// Pentest 11-11-2026: archivos "poliglota" (firma de imagen + script) y validacion de estructura (ASVS v5 V5).

const { imagenValida } = require('../../src/middleware/subidas');

// JPEG real de 8x8 px (generado con ImageMagick) para no depender de archivos fuera de la imagen de pruebas.
const real = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAABv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIwARjz/2Q==', 'base64');

describe('Validacion de estructura de imagenes', () => {
  test('una foto JPG real se acepta', () => {
    expect(imagenValida(real)).toBe('jpg');
  });

  test.each([
    ['firma JPEG + PHP', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('<?php system($_GET[c]); ?>')])],
    ['JPEG real + <script> agregado', Buffer.concat([real, Buffer.from('<script>alert(1)</script>')])],
    ['JPEG real + HTML agregado', Buffer.concat([real, Buffer.from('<html><body>x</body></html>')])],
    ['firma PNG sin bloques', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
    ['firma GIF + SVG', Buffer.from('GIF89a<svg onload=alert(1)>')],
    ['RIFF/WEBP con tamano falso', Buffer.concat([Buffer.from('RIFF'), Buffer.from([0xff, 0xff, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(20)])],
    ['segmentos JPEG corruptos', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0x00])],
  ])('rechaza %s', (_n, buf) => {
    expect(imagenValida(buf)).toBeNull();
  });
});
