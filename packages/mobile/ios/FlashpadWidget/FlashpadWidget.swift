import WidgetKit
import SwiftUI

// MARK: - Timeline Provider

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date())
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        let entry = SimpleEntry(date: Date())
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        let entry = SimpleEntry(date: Date())
        // Widget doesn't need to update frequently since it's just a button
        let nextUpdate = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }
}

// MARK: - Timeline Entry

struct SimpleEntry: TimelineEntry {
    let date: Date
}

// MARK: - Widget Views

struct FlashpadWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        if #available(iOS 16.0, *) {
            switch family {
            case .systemSmall:
                SmallWidgetView()
            case .systemMedium:
                MediumWidgetView()
            case .accessoryCircular:
                AccessoryCircularView()
            case .accessoryRectangular:
                AccessoryRectangularView()
            default:
                SmallWidgetView()
            }
        } else {
            switch family {
            case .systemSmall:
                SmallWidgetView()
            case .systemMedium:
                MediumWidgetView()
            default:
                SmallWidgetView()
            }
        }
    }
}

// Small widget (Home Screen)
struct SmallWidgetView: View {
    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(Color("WidgetBackground"))

            VStack(spacing: 12) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 32, weight: .medium))
                    .foregroundColor(Color(red: 99/255, green: 102/255, blue: 241/255))

                Text("Quick Note")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(.primary)

                Text("Tap to capture")
                    .font(.system(size: 11))
                    .foregroundColor(.secondary)
            }
            .padding()
        }
        .widgetURL(URL(string: "flashpad://quick-capture"))
    }
}

// Medium widget (Home Screen)
struct MediumWidgetView: View {
    var body: some View {
        ZStack {
            ContainerRelativeShape()
                .fill(Color("WidgetBackground"))

            HStack(spacing: 20) {
                Image(systemName: "square.and.pencil")
                    .font(.system(size: 40, weight: .medium))
                    .foregroundColor(Color(red: 99/255, green: 102/255, blue: 241/255))

                VStack(alignment: .leading, spacing: 4) {
                    Text("Flashpad")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundColor(.primary)

                    Text("Quick Note Capture")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(.secondary)

                    Text("Tap anywhere to capture a new note")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .opacity(0.8)
                }

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .widgetURL(URL(string: "flashpad://quick-capture"))
    }
}

// Accessory Circular (Lock Screen) - iOS 16+
@available(iOS 16.0, *)
struct AccessoryCircularView: View {
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            Image(systemName: "square.and.pencil")
                .font(.system(size: 20, weight: .medium))
        }
        .widgetURL(URL(string: "flashpad://quick-capture"))
    }
}

// Accessory Rectangular (Lock Screen) - iOS 16+
@available(iOS 16.0, *)
struct AccessoryRectangularView: View {
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "square.and.pencil")
                .font(.system(size: 20, weight: .medium))

            VStack(alignment: .leading) {
                Text("Flashpad")
                    .font(.system(size: 14, weight: .semibold))
                Text("Quick Note")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
        }
        .widgetURL(URL(string: "flashpad://quick-capture"))
    }
}

// MARK: - Widget Configuration

struct FlashpadWidget: Widget {
    let kind: String = "FlashpadWidget"

    private var supportedFamilies: [WidgetFamily] {
        if #available(iOS 16.0, *) {
            return [
                .systemSmall,
                .systemMedium,
                .accessoryCircular,
                .accessoryRectangular
            ]
        } else {
            return [
                .systemSmall,
                .systemMedium
            ]
        }
    }

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            if #available(iOS 17.0, *) {
                FlashpadWidgetEntryView(entry: entry)
                    .containerBackground(.fill.tertiary, for: .widget)
            } else {
                FlashpadWidgetEntryView(entry: entry)
                    .padding()
                    .background()
            }
        }
        .configurationDisplayName("Quick Note")
        .description("Tap to quickly capture a note in Flashpad.")
        .supportedFamilies(supportedFamilies)
    }
}

// MARK: - Preview

#if DEBUG
struct FlashpadWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            FlashpadWidgetEntryView(entry: SimpleEntry(date: Date()))
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("Small")

            FlashpadWidgetEntryView(entry: SimpleEntry(date: Date()))
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("Medium")

            if #available(iOS 16.0, *) {
                FlashpadWidgetEntryView(entry: SimpleEntry(date: Date()))
                    .previewContext(WidgetPreviewContext(family: .accessoryCircular))
                    .previewDisplayName("Lock Screen Circular")

                FlashpadWidgetEntryView(entry: SimpleEntry(date: Date()))
                    .previewContext(WidgetPreviewContext(family: .accessoryRectangular))
                    .previewDisplayName("Lock Screen Rectangular")
            }
        }
    }
}
#endif
