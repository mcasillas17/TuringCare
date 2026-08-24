import type { BriefPdfModel } from "@/lib/brief-pdf-model";
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

/* TuringCare brand palette (mirrors src/index.css tokens). */
const COLOR = {
  cream: "#faf6ef",
  slate: "#28323d",
  slateSoft: "#4a5c6e",
  silver: "#c9d4dd",
  copper: "#c8893b",
  white: "#ffffff",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLOR.cream,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 11,
    color: COLOR.slate,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: COLOR.copper,
    paddingBottom: 10,
    marginBottom: 18,
  },
  brand: { fontSize: 18, fontWeight: 700, color: COLOR.slate },
  brandAccent: { color: COLOR.copper },
  docTitle: { fontSize: 12, color: COLOR.slateSoft },
  profileBlock: {
    backgroundColor: COLOR.white,
    borderWidth: 1,
    borderColor: COLOR.silver,
    borderRadius: 6,
    padding: 14,
    marginBottom: 18,
  },
  dogName: { fontSize: 16, fontWeight: 700, color: COLOR.slate, marginBottom: 6 },
  metaRow: { flexDirection: "row", flexWrap: "wrap" },
  metaItem: { marginRight: 18, marginBottom: 2 },
  metaLabel: {
    fontSize: 8,
    color: COLOR.slateSoft,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metaValue: { fontSize: 11, color: COLOR.slate },
  statusPill: { fontSize: 10, color: COLOR.copper, fontWeight: 700, textTransform: "uppercase" },
  sectionHeading: {
    fontSize: 10,
    fontWeight: 700,
    color: COLOR.copper,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summary: { fontSize: 11, color: COLOR.slate, lineHeight: 1.55 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLOR.silver,
    paddingTop: 8,
    fontSize: 8,
    color: COLOR.slateSoft,
  },
});

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export function BriefPdfDocument({ model }: { model: BriefPdfModel }) {
  return (
    <Document title={`${model.title} — ${model.dogName}`} author={model.brandName}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>
            Turing<Text style={styles.brandAccent}>Care</Text>
          </Text>
          <Text style={styles.docTitle}>{model.title}</Text>
        </View>

        <View style={styles.profileBlock}>
          <Text style={styles.dogName}>{model.dogName}</Text>
          <View style={styles.metaRow}>
            {model.breed ? <Meta label={model.labels.breed} value={model.breed} /> : null}
            {model.age ? <Meta label={model.labels.age} value={model.age} /> : null}
            {model.size ? <Meta label={model.labels.size} value={model.size} /> : null}
            {model.sex ? <Meta label={model.labels.sex} value={model.sex} /> : null}
          </View>
          <View style={{ marginTop: 6 }}>
            <Text style={styles.statusPill}>{model.statusLabel}</Text>
          </View>
        </View>

        <Text style={styles.sectionHeading}>{model.title}</Text>
        <Text style={styles.summary}>{model.summary}</Text>

        <View style={styles.footer} fixed>
          <Text>
            {model.brandName} · {model.labels.version} {model.version}
          </Text>
          <Text>
            {model.labels.generated} {model.generatedAt}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
