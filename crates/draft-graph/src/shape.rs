//! The typed shape taxonomy (ADR-014): a Rust mirror of
//! `packages/shared/src/shapes.ts`'s `Shape` union, used to validate every
//! object payload that reaches [`crate::Graph::apply`] — human canvas edit
//! or MCP agent write alike — instead of storing whatever JSON happened to
//! parse.
//!
//! Scoped to the eight *drawing* shapes the canvas produces today
//! (rectangle/ellipse/diamond/line/text/arrow/freehand/image). The
//! product-spec's semantic taxonomy (`Region`, `Requirement`, `Flow`, ...)
//! stays deferred per `docs/project-graph.md` — those layer meaning onto
//! objects, they aren't object kinds themselves.

use serde::{Deserialize, Serialize};

/// Fields every known shape kind carries, flattened into each variant's
/// JSON representation so the wire format matches `shapes.ts`'s `ShapeBase`
/// exactly (`{"kind": "...", "x": 0, "y": 0, ...kind-specific fields}`, not
/// `{"kind": "...", "base": {"x": 0, "y": 0}, ...}`).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ShapeBase {
    pub x: f64,
    pub y: f64,
    /// Shapes sharing a `groupId` move and select together — see the
    /// matching comment in `shapes.ts`. Absent (not `null`) when the shape
    /// isn't grouped, matching `groupId?: string`'s TS semantics.
    #[serde(rename = "groupId", default, skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    /// Stacking order — see the matching comment in `shapes.ts`. Absent
    /// (not `0.0`) for a shape that's never had its z-order explicitly
    /// changed.
    #[serde(rename = "zIndex", default, skip_serializing_if = "Option::is_none")]
    pub z_index: Option<f64>,
}

/// Stroke customization, flattened into every shape kind that renders a
/// visible outline (rectangle/ellipse/diamond/line/arrow — not freehand,
/// whose "stroke" is really a filled outline polygon from `perfect-freehand`,
/// or text/image, which have no stroke at all). Absent fields fall back to
/// the theme's default stroke color/width, matching `fill`'s convention.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Stroke {
    #[serde(
        rename = "strokeColor",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub color: Option<String>,
    #[serde(
        rename = "strokeWidth",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub width: Option<f64>,
}

/// The eight shape kinds `@draft/canvas` actually produces. Internally
/// tagged on `kind` (`#[serde(flatten)]` on `base` keeps `x`/`y`/`groupId`
/// adjacent to the kind-specific fields, not nested under a `base` key) —
/// this is deliberately the *only* place that needs to change when
/// `shapes.ts` gains a new kind, per `CLAUDE.md`'s manual-mirror rule.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum KnownShape {
    Rectangle {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fill: Option<String>,
        /// Degrees clockwise around the shape's own bounding-box center.
        /// Absent (not `0.0`) when unrotated, matching every other optional
        /// field's convention here.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rotation: Option<f64>,
        #[serde(flatten)]
        stroke: Stroke,
    },
    Ellipse {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fill: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rotation: Option<f64>,
        #[serde(flatten)]
        stroke: Stroke,
    },
    Diamond {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        fill: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rotation: Option<f64>,
        #[serde(flatten)]
        stroke: Stroke,
    },
    /// A plain straight line — like `Arrow` but rendered with no arrowhead.
    Line {
        #[serde(flatten)]
        base: ShapeBase,
        dx: f64,
        dy: f64,
        #[serde(flatten)]
        stroke: Stroke,
    },
    Text {
        #[serde(flatten)]
        base: ShapeBase,
        text: String,
    },
    Arrow {
        #[serde(flatten)]
        base: ShapeBase,
        dx: f64,
        dy: f64,
        #[serde(flatten)]
        stroke: Stroke,
    },
    Freehand {
        #[serde(flatten)]
        base: ShapeBase,
        /// Points relative to `x`/`y`, in drawing order.
        points: Vec<(f64, f64)>,
    },
    /// `asset_id` is a reference into the project's content-addressed asset
    /// store (`draft-project::save_asset`/`load_asset`), never the raw file
    /// bytes — the whole point being that `get_page`/`get_object` can hand
    /// this to an MCP agent without ever uploading the user's actual image.
    /// See ADR-015 for why this replaced an embedded data URL. `media_kind`
    /// distinguishes a reference-only video import (the asset is a video
    /// file, `width`/`height` describe an extracted thumbnail frame, not
    /// in-canvas video playback) from a plain image — see `shapes.ts`'s
    /// matching comment.
    Image {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
        #[serde(rename = "assetId")]
        asset_id: String,
        #[serde(rename = "mediaKind", default, skip_serializing_if = "Option::is_none")]
        media_kind: Option<MediaKind>,
    },
}

/// The only variant today is `Video` — an imported still image has no
/// `mediaKind` at all (see `ImageShape.mediaKind?` in `shapes.ts`), so this
/// only ever needs to say "this asset isn't actually a still image."
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MediaKind {
    Video,
}

/// Wraps a rotation into `[0, 360)` (and drops an exact `0.0`/`None` to
/// `None`, so an unrotated shape round-trips identically to one that was
/// never rotated at all) — one canonical representation rather than
/// `0.0`/`360.0`/`-360.0` all meaning the same visual angle.
fn normalize_rotation(rotation: Option<f64>) -> Option<f64> {
    let value = rotation?;
    let wrapped = value.rem_euclid(360.0);
    if wrapped == 0.0 {
        None
    } else {
        Some(wrapped)
    }
}

const KNOWN_KINDS: &[&str] = &[
    "rectangle",
    "ellipse",
    "diamond",
    "line",
    "text",
    "arrow",
    "freehand",
    "image",
];

impl KnownShape {
    fn base(&self) -> &ShapeBase {
        match self {
            KnownShape::Rectangle { base, .. }
            | KnownShape::Ellipse { base, .. }
            | KnownShape::Diamond { base, .. }
            | KnownShape::Line { base, .. }
            | KnownShape::Text { base, .. }
            | KnownShape::Arrow { base, .. }
            | KnownShape::Freehand { base, .. }
            | KnownShape::Image { base, .. } => base,
        }
    }

    fn base_mut(&mut self) -> &mut ShapeBase {
        match self {
            KnownShape::Rectangle { base, .. }
            | KnownShape::Ellipse { base, .. }
            | KnownShape::Diamond { base, .. }
            | KnownShape::Line { base, .. }
            | KnownShape::Text { base, .. }
            | KnownShape::Arrow { base, .. }
            | KnownShape::Freehand { base, .. }
            | KnownShape::Image { base, .. } => base,
        }
    }

    /// Rejects a malformed `fill` (anything but a `#rrggbb` hex string) at
    /// the same point a malformed known-kind payload is already rejected —
    /// `fill` is absent-or-valid, never present-and-garbage, matching the
    /// same "validate at the boundary" posture the rest of `Shape` already
    /// takes for every other field.
    fn validate_fill(self) -> Result<Self, String> {
        let fill = match &self {
            KnownShape::Rectangle { fill, .. }
            | KnownShape::Ellipse { fill, .. }
            | KnownShape::Diamond { fill, .. } => fill,
            _ => return Ok(self),
        };
        if let Some(value) = fill {
            let is_valid_hex = value.len() == 7
                && value.starts_with('#')
                && value[1..].chars().all(|c| c.is_ascii_hexdigit());
            if !is_valid_hex {
                return Err(format!("fill must be a #rrggbb hex color, got {value:?}"));
            }
        }
        Ok(self)
    }

    /// Rejects a non-finite `zIndex` — on `ShapeBase`, so every kind (not
    /// just fillable/rotatable ones) needs checking here.
    fn validate_z_index(self) -> Result<Self, String> {
        if let Some(value) = self.base().z_index {
            if !value.is_finite() {
                return Err(format!("zIndex must be a finite number, got {value:?}"));
            }
        }
        Ok(self)
    }

    /// Rejects a non-finite `x`/`y` — on `ShapeBase`, so every kind needs
    /// checking here, same reasoning as `validate_z_index`. Unlike `width`/
    /// `height` (below), position has no `.abs()`-style normalization step
    /// that could otherwise be mistaken for handling this — an infinite or
    /// NaN position would otherwise be stored as-is, corrupting the shape
    /// silently rather than being rejected at this boundary like every
    /// other numeric field the canvas actually renders.
    fn validate_position(self) -> Result<Self, String> {
        let base = self.base();
        if !base.x.is_finite() || !base.y.is_finite() {
            return Err(format!(
                "x/y must be finite numbers, got ({:?}, {:?})",
                base.x, base.y
            ));
        }
        Ok(self)
    }

    /// Rejects a non-finite `width`/`height` (rectangle/ellipse/diamond/
    /// image) or `dx`/`dy` (line/arrow). Must run before `normalized()`'s
    /// `.abs()` step — `f64::INFINITY.abs()` is still infinity, so that step
    /// alone can't turn a malformed value into a valid one the way it does
    /// for a merely-negative one.
    fn validate_dimensions(self) -> Result<Self, String> {
        let dims = match &self {
            KnownShape::Rectangle { width, height, .. }
            | KnownShape::Ellipse { width, height, .. }
            | KnownShape::Diamond { width, height, .. }
            | KnownShape::Image { width, height, .. } => Some((*width, *height)),
            KnownShape::Line { dx, dy, .. } | KnownShape::Arrow { dx, dy, .. } => Some((*dx, *dy)),
            KnownShape::Text { .. } | KnownShape::Freehand { .. } => None,
        };
        if let Some((a, b)) = dims {
            if !a.is_finite() || !b.is_finite() {
                return Err(format!(
                    "width/height (or dx/dy) must be finite numbers, got ({a:?}, {b:?})"
                ));
            }
        }
        Ok(self)
    }

    /// Rejects an empty `points` array (nothing to draw — the freehand
    /// equivalent of a zero-size shape) or any non-finite coordinate within
    /// it, for the one shape kind (`Freehand`) that carries a variable-
    /// length numeric payload none of the other validators above touch.
    fn validate_points(self) -> Result<Self, String> {
        let KnownShape::Freehand { points, .. } = &self else {
            return Ok(self);
        };
        if points.is_empty() {
            return Err("freehand points must not be empty".to_string());
        }
        if let Some((x, y)) = points
            .iter()
            .find(|(x, y)| !x.is_finite() || !y.is_finite())
        {
            return Err(format!(
                "freehand points must all be finite, got ({x:?}, {y:?})"
            ));
        }
        Ok(self)
    }

    /// Rejects a non-finite `rotation` (NaN/infinity — never producible by
    /// the canvas's own drag-to-rotate math, but a malformed MCP write
    /// could still send one) at the same validation boundary as `fill`.
    fn validate_rotation(self) -> Result<Self, String> {
        let rotation = match &self {
            KnownShape::Rectangle { rotation, .. }
            | KnownShape::Ellipse { rotation, .. }
            | KnownShape::Diamond { rotation, .. } => rotation,
            _ => return Ok(self),
        };
        if let Some(value) = rotation {
            if !value.is_finite() {
                return Err(format!("rotation must be a finite number, got {value:?}"));
            }
        }
        Ok(self)
    }

    /// Rejects a malformed `strokeColor` (same `#rrggbb` rule as `fill`) or a
    /// non-positive/non-finite `strokeWidth` — a zero or negative stroke
    /// width isn't a rendering error exactly, but it's meaningless, and
    /// rejecting it here matches this crate's "validate at the boundary"
    /// posture instead of silently storing a value that draws nothing.
    fn validate_stroke(self) -> Result<Self, String> {
        let stroke = match &self {
            KnownShape::Rectangle { stroke, .. }
            | KnownShape::Ellipse { stroke, .. }
            | KnownShape::Diamond { stroke, .. }
            | KnownShape::Line { stroke, .. }
            | KnownShape::Arrow { stroke, .. } => stroke,
            _ => return Ok(self),
        };
        if let Some(value) = &stroke.color {
            let is_valid_hex = value.len() == 7
                && value.starts_with('#')
                && value[1..].chars().all(|c| c.is_ascii_hexdigit());
            if !is_valid_hex {
                return Err(format!(
                    "strokeColor must be a #rrggbb hex color, got {value:?}"
                ));
            }
        }
        if let Some(value) = stroke.width {
            if !value.is_finite() || value <= 0.0 {
                return Err(format!(
                    "strokeWidth must be a positive finite number, got {value:?}"
                ));
            }
        }
        Ok(self)
    }

    /// Clamps a rectangle/ellipse/diamond/image's `width`/`height` to
    /// non-negative — closes the render/hit-test desync a negative size
    /// caused (found in the 2026-09-06 code review): `ShapeView.tsx` used
    /// `Math.abs(width)` to render while `geometry.ts` used `min`/`max` to
    /// compute hit-test bounds, silently disagreeing about which side of
    /// `x`/`y` the shape actually occupies.
    fn normalized(self) -> Self {
        match self {
            KnownShape::Rectangle {
                base,
                width,
                height,
                fill,
                rotation,
                stroke,
            } => KnownShape::Rectangle {
                base,
                width: width.abs(),
                height: height.abs(),
                fill,
                rotation: normalize_rotation(rotation),
                stroke,
            },
            KnownShape::Ellipse {
                base,
                width,
                height,
                fill,
                rotation,
                stroke,
            } => KnownShape::Ellipse {
                base,
                width: width.abs(),
                height: height.abs(),
                fill,
                rotation: normalize_rotation(rotation),
                stroke,
            },
            KnownShape::Diamond {
                base,
                width,
                height,
                fill,
                rotation,
                stroke,
            } => KnownShape::Diamond {
                base,
                width: width.abs(),
                height: height.abs(),
                fill,
                rotation: normalize_rotation(rotation),
                stroke,
            },
            KnownShape::Image {
                base,
                width,
                height,
                asset_id,
                media_kind,
            } => KnownShape::Image {
                base,
                width: width.abs(),
                height: height.abs(),
                asset_id,
                media_kind,
            },
            other => other,
        }
    }
}

/// One object's shape payload: a recognized kind (validated, typed) or
/// `Other` — a `kind` this build of `draft-graph` doesn't recognize yet,
/// kept verbatim rather than rejected outright. See ADR-014 for why: a
/// frontend shape kind added before its Rust mirror lands (or a future
/// extension point) still needs somewhere to go, but only known kinds get
/// real validation and typed field access.
#[derive(Debug, Clone, PartialEq)]
pub enum Shape {
    Known(KnownShape),
    Other(serde_json::Value),
}

impl Shape {
    /// Every shape's position, whether known or opaque — `Other` reads
    /// `x`/`y` straight off the JSON object (falling back to `0.0` if
    /// they're missing or not numbers, since an opaque payload isn't
    /// guaranteed to have them at all).
    pub fn position(&self) -> (f64, f64) {
        match self {
            Shape::Known(k) => {
                let base = k.base();
                (base.x, base.y)
            }
            Shape::Other(value) => {
                let x = value.get("x").and_then(|v| v.as_f64()).unwrap_or(0.0);
                let y = value.get("y").and_then(|v| v.as_f64()).unwrap_or(0.0);
                (x, y)
            }
        }
    }

    /// Sets `x`/`y` uniformly, regardless of kind — what
    /// `Operation::MoveObject` needs, mirroring `shapes.ts`'s comment that
    /// "every shape has `x`/`y` at the top level" for exactly this reason.
    pub fn set_position(&mut self, x: f64, y: f64) {
        match self {
            Shape::Known(k) => {
                let base = k.base_mut();
                base.x = x;
                base.y = y;
            }
            Shape::Other(value) => {
                if let Some(map) = value.as_object_mut() {
                    map.insert("x".into(), x.into());
                    map.insert("y".into(), y.into());
                }
            }
        }
    }
}

impl Serialize for Shape {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            Shape::Known(k) => k.serialize(serializer),
            Shape::Other(v) => v.serialize(serializer),
        }
    }
}

impl<'de> Deserialize<'de> for Shape {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = serde_json::Value::deserialize(deserializer)?;
        let kind = value.get("kind").and_then(|k| k.as_str());
        match kind {
            // A recognized kind must parse cleanly into that variant's
            // fields — a malformed known-kind payload (wrong field type,
            // missing required field) is a real error, not silently kept
            // as an opaque blob (that would defeat the point of validating
            // at all).
            Some(k) if KNOWN_KINDS.contains(&k) => {
                let shape = serde_json::from_value::<KnownShape>(value)
                    .map_err(serde::de::Error::custom)?;
                shape
                    .validate_fill()
                    .and_then(KnownShape::validate_rotation)
                    .and_then(KnownShape::validate_stroke)
                    .and_then(KnownShape::validate_z_index)
                    .and_then(KnownShape::validate_position)
                    .and_then(KnownShape::validate_dimensions)
                    .and_then(KnownShape::validate_points)
                    .map(|s| Shape::Known(s.normalized()))
                    .map_err(serde::de::Error::custom)
            }
            // No kind, or one this build doesn't know about yet: keep it
            // verbatim rather than rejecting it.
            _ => Ok(Shape::Other(value)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn roundtrip(json: serde_json::Value) -> Shape {
        serde_json::from_value(json).expect("should parse")
    }

    #[test]
    fn known_kinds_parse_into_typed_variants() {
        let shape = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 1.0, "y": 2.0, "width": 10.0, "height": 20.0
        }));
        assert!(matches!(shape, Shape::Known(KnownShape::Rectangle { .. })));
        assert_eq!(shape.position(), (1.0, 2.0));
    }

    #[test]
    fn group_id_round_trips_and_is_omitted_when_absent() {
        let grouped = roundtrip(serde_json::json!({
            "kind": "text", "x": 0.0, "y": 0.0, "text": "hi", "groupId": "object://abc"
        }));
        let json = serde_json::to_value(&grouped).unwrap();
        assert_eq!(json["groupId"], "object://abc");

        let ungrouped =
            roundtrip(serde_json::json!({ "kind": "text", "x": 0.0, "y": 0.0, "text": "hi" }));
        let json = serde_json::to_value(&ungrouped).unwrap();
        assert!(json.get("groupId").is_none());
    }

    #[test]
    fn z_index_round_trips_on_any_kind_and_is_omitted_when_absent() {
        let ordered = roundtrip(serde_json::json!({
            "kind": "text", "x": 0.0, "y": 0.0, "text": "hi", "zIndex": 3.0
        }));
        let json = serde_json::to_value(&ordered).unwrap();
        assert_eq!(json["zIndex"], 3.0);

        let unordered =
            roundtrip(serde_json::json!({ "kind": "text", "x": 0.0, "y": 0.0, "text": "hi" }));
        let json = serde_json::to_value(&unordered).unwrap();
        assert!(json.get("zIndex").is_none());
    }

    #[test]
    fn a_non_finite_z_index_is_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "text", "x": 0.0, "y": 0.0, "text": "hi", "zIndex": 1e400}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn a_non_finite_position_is_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "text", "x": 1e400, "y": 0.0, "text": "hi"}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn non_finite_width_or_height_is_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "rectangle", "x": 0.0, "y": 0.0, "width": 1e400, "height": 10.0}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn non_finite_dx_or_dy_is_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "line", "x": 0.0, "y": 0.0, "dx": 1e400, "dy": 0.0}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn empty_freehand_points_are_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "freehand", "x": 0.0, "y": 0.0, "points": []}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn a_non_finite_freehand_point_is_rejected() {
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "freehand", "x": 0.0, "y": 0.0, "points": [[1e400, 0.0]]}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn unknown_kind_is_kept_verbatim_instead_of_rejected() {
        let original =
            serde_json::json!({ "kind": "region", "x": 0.0, "y": 0.0, "note": "future spec kind" });
        let shape = roundtrip(original.clone());
        assert!(matches!(shape, Shape::Other(_)));
        assert_eq!(serde_json::to_value(&shape).unwrap(), original);
    }

    #[test]
    fn a_recognized_kind_with_malformed_fields_is_rejected() {
        let err = serde_json::from_value::<Shape>(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": "not a number", "height": 10.0
        }))
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn negative_width_and_height_normalize_to_non_negative() {
        let shape = roundtrip(serde_json::json!({
            "kind": "image", "x": 0.0, "y": 0.0, "width": -50.0, "height": -25.0, "assetId": "abc123.png"
        }));
        match shape {
            Shape::Known(KnownShape::Image { width, height, .. }) => {
                assert_eq!(width, 50.0);
                assert_eq!(height, 25.0);
            }
            _ => panic!("expected an Image variant"),
        }
    }

    #[test]
    fn image_media_kind_round_trips_and_is_omitted_when_absent() {
        let video = roundtrip(serde_json::json!({
            "kind": "image", "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0,
            "assetId": "abc.mp4", "mediaKind": "video"
        }));
        let json = serde_json::to_value(&video).unwrap();
        assert_eq!(json["mediaKind"], "video");

        let still = roundtrip(serde_json::json!({
            "kind": "image", "x": 0.0, "y": 0.0, "width": 100.0, "height": 50.0, "assetId": "abc.png"
        }));
        let json = serde_json::to_value(&still).unwrap();
        assert!(json.get("mediaKind").is_none());
    }

    #[test]
    fn fill_round_trips_and_is_omitted_when_absent() {
        let filled = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "fill": "#a1b2c3"
        }));
        let json = serde_json::to_value(&filled).unwrap();
        assert_eq!(json["fill"], "#a1b2c3");

        let unfilled = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0
        }));
        let json = serde_json::to_value(&unfilled).unwrap();
        assert!(json.get("fill").is_none());
    }

    #[test]
    fn a_malformed_fill_is_rejected() {
        let err = serde_json::from_value::<Shape>(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "fill": "red"
        }))
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn rotation_round_trips_and_is_omitted_when_absent_or_zero() {
        let rotated = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "rotation": 45.0
        }));
        let json = serde_json::to_value(&rotated).unwrap();
        assert_eq!(json["rotation"], 45.0);

        let unrotated = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0
        }));
        assert!(serde_json::to_value(&unrotated)
            .unwrap()
            .get("rotation")
            .is_none());

        let explicit_zero = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "rotation": 0.0
        }));
        assert!(serde_json::to_value(&explicit_zero)
            .unwrap()
            .get("rotation")
            .is_none());
    }

    #[test]
    fn rotation_wraps_into_a_canonical_0_to_360_range() {
        let over = roundtrip(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "rotation": 405.0
        }));
        assert_eq!(serde_json::to_value(&over).unwrap()["rotation"], 45.0);

        let negative = roundtrip(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "rotation": -90.0
        }));
        assert_eq!(serde_json::to_value(&negative).unwrap()["rotation"], 270.0);
    }

    #[test]
    fn a_non_finite_rotation_is_rejected() {
        // A literal `NaN` isn't valid JSON syntax at all (rejected before a
        // Shape is ever constructed) — an overflowing literal like this,
        // which parses to `f64::INFINITY`, is the reachable non-finite case.
        let err = serde_json::from_str::<Shape>(
            r#"{"kind": "diamond", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0, "rotation": 1e400}"#,
        )
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn stroke_round_trips_and_is_omitted_when_absent() {
        let stroked = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0,
            "strokeColor": "#a1b2c3", "strokeWidth": 3.0
        }));
        let json = serde_json::to_value(&stroked).unwrap();
        assert_eq!(json["strokeColor"], "#a1b2c3");
        assert_eq!(json["strokeWidth"], 3.0);

        let unstroked = roundtrip(serde_json::json!({
            "kind": "rectangle", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0
        }));
        let json = serde_json::to_value(&unstroked).unwrap();
        assert!(json.get("strokeColor").is_none());
        assert!(json.get("strokeWidth").is_none());
    }

    #[test]
    fn stroke_applies_to_line_and_arrow_too() {
        let line = roundtrip(serde_json::json!({
            "kind": "line", "x": 0.0, "y": 0.0, "dx": 10.0, "dy": 10.0,
            "strokeColor": "#000000", "strokeWidth": 2.0
        }));
        assert_eq!(
            serde_json::to_value(&line).unwrap()["strokeColor"],
            "#000000"
        );

        let arrow = roundtrip(serde_json::json!({
            "kind": "arrow", "x": 0.0, "y": 0.0, "dx": 10.0, "dy": 10.0,
            "strokeColor": "#111111", "strokeWidth": 2.0
        }));
        assert_eq!(
            serde_json::to_value(&arrow).unwrap()["strokeColor"],
            "#111111"
        );
    }

    #[test]
    fn a_malformed_stroke_color_is_rejected() {
        let err = serde_json::from_value::<Shape>(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0,
            "strokeColor": "blue"
        }))
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn a_non_positive_stroke_width_is_rejected() {
        let err = serde_json::from_value::<Shape>(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0,
            "strokeWidth": 0.0
        }))
        .unwrap_err();
        assert!(!err.to_string().is_empty());

        let err = serde_json::from_value::<Shape>(serde_json::json!({
            "kind": "ellipse", "x": 0.0, "y": 0.0, "width": 10.0, "height": 10.0,
            "strokeWidth": -2.0
        }))
        .unwrap_err();
        assert!(!err.to_string().is_empty());
    }

    #[test]
    fn stroke_does_not_apply_to_text_freehand_or_image() {
        let shape = roundtrip(serde_json::json!({
            "kind": "text", "x": 0.0, "y": 0.0, "text": "hi",
            "strokeColor": "#ffffff", "strokeWidth": 5.0
        }));
        // Same "stray unrecognized field" behavior as fill on a non-fillable kind.
        assert!(matches!(shape, Shape::Known(KnownShape::Text { .. })));
    }

    #[test]
    fn fill_only_applies_to_rectangle_ellipse_diamond() {
        // A non-fillable shape kind carrying a stray "fill" key isn't an
        // error — it's just an unrecognized extra field, silently ignored
        // by serde the same way any other unknown field would be.
        let shape = roundtrip(serde_json::json!({
            "kind": "text", "x": 0.0, "y": 0.0, "text": "hi", "fill": "#ffffff"
        }));
        assert!(matches!(shape, Shape::Known(KnownShape::Text { .. })));
    }

    #[test]
    fn set_position_works_uniformly_for_known_and_unknown_shapes() {
        let mut known = roundtrip(
            serde_json::json!({ "kind": "line", "x": 0.0, "y": 0.0, "dx": 1.0, "dy": 1.0 }),
        );
        known.set_position(5.0, 6.0);
        assert_eq!(known.position(), (5.0, 6.0));

        let mut other = roundtrip(serde_json::json!({ "kind": "region", "x": 0.0, "y": 0.0 }));
        other.set_position(7.0, 8.0);
        assert_eq!(other.position(), (7.0, 8.0));
    }
}
