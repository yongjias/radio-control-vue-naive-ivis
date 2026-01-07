function generateSinePoints(minX, maxX, steps) {
    const points = [];
    const step = (maxX - minX) / steps;
    for (let x = minX; x <= maxX; x += step) {
        const y = Math.sin(x);
        points.push({ x, y });
    }
    return points;
}
function generateReverseSinePoints(minX, maxX, steps) {
  const points = [];
  const step = (maxX - minX) / steps;
  for (let x = minX; x <= maxX; x += step) {
      const y = Math.sin(-x);
      points.push({ x, y });
  }
  return points;
}

function scalePoints(points, width, height) {
    const minX = Math.min(...points.map(p => p.x));
    const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y));
    const maxY = Math.max(...points.map(p => p.y));

    return points.map(p => ({
        x: ((p.x - minX) / (maxX - minX)) * width,
        y: height - ((p.y - minY) / (maxY - minY)) * height
    }));
}

function createPath(points) {
    return points.map((p, i) => (i === 0 ? `M ${p.x},${p.y}` : `L ${p.x},${p.y}`)).join(' ');
}

export function create_svg_path_sin (width, height) { // width, height: px unit
    const points = generateSinePoints(-Math.PI / 2, Math.PI / 2, Math.max(width,height));
    const scaledPoints = scalePoints(points, width, height);
    return createPath(scaledPoints);
}

export function create_svg_path_rsin (width, height) { // width, height: px unit
    const points = generateReverseSinePoints(-Math.PI / 2, Math.PI / 2, Math.max(width, height));
    const scaledPoints = scalePoints(points, width, height);
    return createPath(scaledPoints);
}