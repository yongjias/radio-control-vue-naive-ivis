import * as Cesium from 'cesium'
 
export function GlowLineMaterialProperty(options) {
  options = Cesium.defaultValue(options, Cesium.defaultValue.EMPTY_OBJECT);
 
  this._definitionChanged = new Cesium.Event();
  this._color = undefined;
  this._power = undefined;
 
  this.color = options.color || Cesium.Color.fromBytes(0, 255, 255, 255);
  this.power = options.power || 0.25;
}
 
Object.defineProperties(GlowLineMaterialProperty.prototype, {
  isConstant: {
    get: function () {
      return (
        Cesium.Property.isConstant(this._color) 
        && Cesium.Property.isConstant(this._power)
      );
    },
  },
 
  definitionChanged: {
    get: function () {
      return this._definitionChanged;
    },
  },
 
  color: Cesium.createPropertyDescriptor("color"),
  power: Cesium.createPropertyDescriptor("power")
});
 
GlowLineMaterialProperty.prototype.getType = function (time) {
  return "GlowLine";
};
 
GlowLineMaterialProperty.prototype.getValue = function (time, result) {
  if (!Cesium.defined(result)) {
    result = {};
  }
 
  result.color = Cesium.Property.getValueOrClonedDefault(this._color, time);
  result.power = Cesium.Property.getValueOrClonedDefault(this._power, time);
  return result;
};
 
GlowLineMaterialProperty.prototype.equals = function (other) {
  const res = this === other || (other instanceof GlowLineMaterialProperty &&
    Cesium.Property.equals(this._color, other._color) &&
    Cesium.Property.equals(this._power, other._power))
  return res;
};

Cesium.Material.GlowLine = 'GlowLine';
Cesium.Material.GlowLineSource = `
    czm_material czm_getMaterial(czm_materialInput materialInput)
    { 
        czm_material material = czm_getDefaultMaterial(materialInput);
        vec2 st = materialInput.st;

        // distance from center, 0 at center → 1 at edge
        float d = abs(st.t - 0.5) * 2.0;

        // Gaussian-like falloff: exp( -k * d * d )
        // larger k = tighter glow; smaller k = wider blur
        float k = power * 10.0; 
        float glow = exp(-k * d * d);

        material.alpha   = glow * color.a;
        material.diffuse = color.rgb;
        return material;
    }
`;
Cesium.Material._materialCache.addMaterial(
  Cesium.Material.GlowLine,
  {
    fabric: {
      type: Cesium.Material.GlowLine,
      uniforms: {
        color: new Cesium.Color(1.0, 0.0, 0.0, 0.7),
        power: 0.25
      },
      source: Cesium.Material.GlowLineSource,
    },
    translucent: function (material) {
        return true;
    },
  }
)