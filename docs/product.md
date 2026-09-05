# Product

## Positioning

DRAFT is a cross-platform visual workspace for humans and AI agents to collaboratively
create, communicate, understand, and build ideas. Core philosophy: **if you can't explain it
to AI, show it to AI.**

DRAFT lets a human express ideas visually — sketches, diagrams, annotations, imported
references — that are hard to communicate through text alone. An AI agent then reads that
workspace through MCP, instead of the human repeatedly uploading screenshots, images, or
video and re-explaining them.

DRAFT is **not**:

- a drawing application
- an AI image generator
- a whiteboard
- a code generator
- a Claude-specific plugin (Claude is the first integration, not the definition of the
  product — see [docs/mcp.md](mcp.md))

It's a **visual context layer between humans and AI agents**.

## The problem

The typical AI-assisted workflow today:

```
Human: "I want something like this."
  -> take a screenshot
  -> upload it
  -> explain it
  -> repeat context next session
  -> correct the model's misunderstanding
  -> repeat
```

DRAFT changes the shape of that loop:

```
Human creates visually (draw / annotate / import references / connect ideas)
        v
DRAFT Project Graph (structured, agent-readable)
        v
MCP
        v
AI agent understands
        v
Agent implements / refines
```

The human is responsible for expressing intent. The agent is responsible for understanding
and implementing it.

## Primary use case: game and level design

DRAFT is built to be exceptionally useful for game developers and designers: level design,
game flow, environment layout, gameplay flow, UI mockups, character concepts, storyboards,
scene planning, world building, game architecture. A developer can sketch a level flow,
annotate it ("player should discover the enemy here", "use this reference for the
environment"), and have an agent understand the whole design through MCP.

## Broader use cases

Software architecture, application/web/UI design, illustrations, concept art, storyboards,
animation planning, system diagrams, workflows, data models, product planning, technical
diagrams, and general creative brainstorming. General-purpose, with game development as the
sharpest edge.

## Product boundary

DRAFT does not try to replace Photoshop, Illustrator, Figma, Blender, Unity, Unreal Engine,
VS Code, Claude, Codex, or any IDE. It integrates with those workflows:

```
Human visual intent -> DRAFT -> structured context -> MCP -> AI agent -> existing tools
```

## Token/media efficiency (accurate framing)

DRAFT does not "eliminate" AI token or media costs. The goal is to avoid *repeatedly*
transmitting raw media when structured workspace information already answers the question —
an agent reads semantic context, annotations, and regions first, and only requests the raw
image/video when it actually needs to look. See [docs/media.md](media.md).

## Long-term vision

DRAFT aims to become a universal visual context layer for AI agents: a human creates almost
anything visually, and the agent understands it without the human translating everything
into words, then goes and operates inside its normal environment — an IDE, a terminal, a
game engine, whatever the agent already works in. DRAFT stays the human's visual source of
intent; it doesn't need to become an IDE itself.
