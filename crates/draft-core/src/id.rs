use std::{fmt, str::FromStr};

use serde::{de::Error as _, Deserialize, Deserializer, Serialize, Serializer};
use uuid::Uuid;

use crate::error::CoreError;

/// Defines a stable, time-ordered (UUIDv7) typed ID that serializes as the
/// spec's `scheme://<uuid>` URI form (spec §8), e.g. `object://0190...`.
///
/// Each generated type is a distinct Rust type, so a `PageId` can never be
/// passed where an `ObjectId` is expected even though both wrap a `Uuid`.
macro_rules! draft_id {
    ($(#[$doc:meta])* $name:ident, $scheme:literal) => {
        $(#[$doc])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub struct $name(Uuid);

        impl $name {
            pub const SCHEME: &'static str = $scheme;

            /// Generates a new, time-ordered ID.
            pub fn new() -> Self {
                Self(Uuid::now_v7())
            }

            pub fn as_uuid(&self) -> Uuid {
                self.0
            }
        }

        impl Default for $name {
            fn default() -> Self {
                Self::new()
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}://{}", Self::SCHEME, self.0)
            }
        }

        impl FromStr for $name {
            type Err = CoreError;

            fn from_str(s: &str) -> Result<Self, Self::Err> {
                let uuid_part = s
                    .strip_prefix(concat!($scheme, "://"))
                    .ok_or_else(|| CoreError::invalid_id($scheme, s))?;
                let uuid = Uuid::parse_str(uuid_part)
                    .map_err(|_| CoreError::invalid_id($scheme, s))?;
                Ok(Self(uuid))
            }
        }

        impl Serialize for $name {
            fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
                serializer.serialize_str(&self.to_string())
            }
        }

        impl<'de> Deserialize<'de> for $name {
            fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
                let raw = String::deserialize(deserializer)?;
                Self::from_str(&raw).map_err(D::Error::custom)
            }
        }
    };
}

draft_id!(
    /// Identifies a DRAFT project (`project://<uuid>`).
    ProjectId,
    "project"
);
draft_id!(
    /// Identifies a page within a project (`page://<uuid>`).
    PageId,
    "page"
);
draft_id!(
    /// Identifies any object on a page — shape, stroke, text, arrow, etc.
    /// (`object://<uuid>`).
    ObjectId,
    "object"
);
draft_id!(
    /// Identifies an imported media asset (`asset://<uuid>`).
    AssetId,
    "asset"
);
draft_id!(
    /// Identifies an annotation attached to an object or asset
    /// (`annotation://<uuid>`).
    AnnotationId,
    "annotation"
);
draft_id!(
    /// Identifies a region within an image or video timeline
    /// (`region://<uuid>`).
    RegionId,
    "region"
);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_display_and_parse() {
        let id = ObjectId::new();
        let rendered = id.to_string();
        assert!(rendered.starts_with("object://"));

        let parsed: ObjectId = rendered.parse().expect("valid id parses back");
        assert_eq!(id, parsed);
    }

    #[test]
    fn rejects_wrong_scheme() {
        let page_shaped = "page://0190f1e4-0000-7000-8000-000000000000";
        assert!(ObjectId::from_str(page_shaped).is_err());
    }

    #[test]
    fn round_trips_through_serde_as_uri_string() {
        let id = AssetId::new();
        let json = serde_json::to_string(&id).unwrap();
        assert_eq!(json, format!("\"{id}\""));

        let parsed: AssetId = serde_json::from_str(&json).unwrap();
        assert_eq!(id, parsed);
    }
}
