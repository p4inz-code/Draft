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
    },
    Ellipse {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
    },
    Diamond {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
    },
    /// A plain straight line — like `Arrow` but rendered with no arrowhead.
    Line {
        #[serde(flatten)]
        base: ShapeBase,
        dx: f64,
        dy: f64,
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
    },
    Freehand {
        #[serde(flatten)]
        base: ShapeBase,
        /// Points relative to `x`/`y`, in drawing order.
        points: Vec<(f64, f64)>,
    },
    /// `src` is a data URL embedded directly in the payload — see the
    /// matching comment on `ImageShape` in `shapes.ts` for why (no
    /// `asset://` reference yet; needs a project directory to exist).
    Image {
        #[serde(flatten)]
        base: ShapeBase,
        width: f64,
        height: f64,
        src: String,
    },
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
            } => KnownShape::Rectangle {
                base,
                width: width.abs(),
                height: height.abs(),
            },
            KnownShape::Ellipse {
                base,
                width,
                height,
            } => KnownShape::Ellipse {
                base,
                width: width.abs(),
                height: height.abs(),
            },
            KnownShape::Diamond {
                base,
                width,
                height,
            } => KnownShape::Diamond {
                base,
                width: width.abs(),
                height: height.abs(),
            },
            KnownShape::Image {
                base,
                width,
                height,
                src,
            } => KnownShape::Image {
                base,
                width: width.abs(),
                height: height.abs(),
                src,
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
            Some(k) if KNOWN_KINDS.contains(&k) => serde_json::from_value::<KnownShape>(value)
                .map(|k| Shape::Known(k.normalized()))
                .map_err(serde::de::Error::custom),
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
            "kind": "image", "x": 0.0, "y": 0.0, "width": -50.0, "height": -25.0, "src": "data:,"
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
