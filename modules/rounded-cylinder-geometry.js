import { Shape, ExtrudeGeometry } from "three";

function RoundedCylinderGeometry(
  radius,
  length,
  bevelSize,
  bevelSteps,
  steps = 1
) {
  var circleRadius = radius;
  var circleShape = new Shape();
  circleShape.moveTo(0, circleRadius);
  circleShape.quadraticCurveTo(circleRadius, circleRadius, circleRadius, 0);
  circleShape.quadraticCurveTo(circleRadius, -circleRadius, 0, -circleRadius);
  circleShape.quadraticCurveTo(-circleRadius, -circleRadius, -circleRadius, 0);
  circleShape.quadraticCurveTo(-circleRadius, circleRadius, 0, circleRadius);

  var extrudeSettings = {
    steps: steps,
    amount: length,
    bevelEnabled: true,
    bevelThickness: bevelSize,
    bevelSize: bevelSize,
    bevelSegments: bevelSteps,
  };

  const geometry = new ExtrudeGeometry(circleShape, extrudeSettings);
  return geometry;
}

export { RoundedCylinderGeometry };
