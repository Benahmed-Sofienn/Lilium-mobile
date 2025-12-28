import React, { useState } from "react";
import { View, Image, Button, Text, Alert, ScrollView } from "react-native";
import DocumentScanner from "react-native-document-scanner-plugin";
import axios from "axios";

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function ScannerTest() {
  const [images, setImages] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<any>(null);

  const scan = async () => {
    const { scannedImages, status } = await DocumentScanner.scanDocument({
      croppedImageQuality: 90,
      // maxNumDocuments: 5, // optional Android-only cap
    });

    if (status !== "success") return;
    if (scannedImages?.length) setImages(scannedImages);
  };

  const upload = async () => {
    if (!API_URL) {
      Alert.alert("Config error", "EXPO_PUBLIC_API_URL is missing.");
      return;
    }
    if (!images.length) return;

    // TEMP for Day 1 smoke test (replace with real username from /me on Day 2)
    const userName = "testuser";

    const form = new FormData();
    images.forEach((uri, idx) => {
      form.append("files", {
        uri,
        name: `scan_${Date.now()}_${idx}.jpg`,
        type: "image/jpeg",
      } as any);
    });

    try {
      const res = await axios.post(`${API_URL}/media/rapports/${userName}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploaded(res.data);
      Alert.alert("Upload OK", "Server responded successfully.");
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Unknown error");
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Button title="Scan document" onPress={scan} />
      <Button title="Upload scans" onPress={upload} />
      <Text>Scanned: {images.length}</Text>

      {images[0] ? (
        <Image source={{ uri: images[0] }} style={{ width: "100%", height: 400 }} resizeMode="contain" />
      ) : null}

      {uploaded ? <Text>Server response: {JSON.stringify(uploaded)}</Text> : null}
    </ScrollView>
  );
}
