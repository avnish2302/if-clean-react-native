import { View, Text, Pressable, Image, ActivityIndicator } from "react-native"
import { useState } from "react"
import * as ImagePicker from "expo-image-picker"
import * as ImageManipulator from "expo-image-manipulator"

const lightTheme = {
  background: "#f5f5f5",
  card: "#ffffff",
  text: "#000000",
  subText: "#505050",
  border: "#ddd",
  button: "#000",
  buttonText: "#fff",
  secondaryBtn: "#eee",
}

const darkTheme = {
  background: "#212121",
  card: "#3f3f3f",
  text: "#ffffff",
  subText: "#aaa",
  border: "#3f3f3f",
  button: "#ffffff",
  buttonText: "#000",
  secondaryBtn: "#1a1a1a",
}

export default function App() {
  const [image, setImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [isDark, setIsDark] = useState(true)

  const theme = isDark ? darkTheme : lightTheme
  const isDisabled = loading || !image

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
      exif: false,
    })

    if (!res.canceled) {
      const picked = res.assets[0]
      const manipulated = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
      )

      setImage({
        uri: manipulated.uri,
        mimeType: "image/jpeg",
        width: manipulated.width,
        height: manipulated.height,
      })
      setResult(null)
    }
  }

  const takePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) {
      alert("Camera permission is required.")
      return
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 1,
      allowsEditing: false,
      exif: false,
    })

    if (!res.canceled) {
      const picked = res.assets[0];
      const manipulated = await ImageManipulator.manipulateAsync(
        picked.uri,
        [{ resize: { width: 1280 } }],
        { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
      )
      setImage({
        uri: manipulated.uri,
        mimeType: "image/jpeg",
        width: manipulated.width,
        height: manipulated.height,
      })
      setResult(null)
    }
  };

  const analyzeImage = async () => {
    if (!image || loading) return

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append("image", {
        uri: image.uri,
        name: "photo.jpg",
        type: image.mimeType || "image/jpeg",
      })

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30000)

      const response = await fetch(
        "http://192.168.1.101:8000/analyze-cleanliness",
        {
          method: "POST",
          body: formData,
        },
      )

      clearTimeout(timeout)

      const text = await response.text()             // response.text() and response.json() always returns Promise so we need to use await

      let data;
      try {
        data = JSON.parse(text)
      } catch {
        throw new Error("Invalid server response")
      }

      if (!response.ok) {
        throw new Error(data.error || "Request failed")
      }
      setResult(data)
    } catch (err) {
      if (err.name === "AbortError") {
        setResult({ error: "Request timed out. Please try again" })
      } else {
        console.log("Error:", err)
        setResult({ error: err.message })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        justifyContent: "center",
        alignItems: "center",
        padding: 20,
      }}
    >
      <Pressable
        onPress={() => setIsDark((prev) => !prev)}
        style={{
          position: "absolute",
          top: 50,
          right: 20,
          zIndex: 10,
          width: 50,
          height: 50,
          backgroundColor: theme.card,
          justifyContent: "center",
          alignItems: "center",
          borderRadius: 25,
          borderWidth: 1,
          borderColor: theme.border,

          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: 3 },

          elevation: 5,
        }}
      >
        <Text style={{ fontSize: 20 }}>{isDark ? "☀️" : "🌙"}</Text>
      </Pressable>

      {(image || result) && (
        <Pressable
          onPress={() => {
            setImage(null)
            setResult(null)
          }}
          disabled={loading}
          style={{
            alignSelf: "flex-end",
            marginBottom: 10,
            paddingHorizontal: 16,
            padding: 12,
            backgroundColor: loading ? "#777" : "#ef4444",
            borderRadius: 10,
            opacity: loading ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "white" }}>Reset</Text>
        </Pressable>
      )}

      <View
        style={{
          width: "100%",
          maxWidth: 420,
          backgroundColor: theme.card,
          borderRadius: 20,
          padding: 20,

          shadowColor: "#000",
          shadowOpacity: 0.3,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 5 },

          elevation: 8,
        }}
      >
        <Text
          style={{
            color: theme.text,
            fontSize: 22,
            textAlign: "center",
            marginBottom: 20,
            fontWeight: "600",
          }}
        >
          Analyzer Tool
        </Text>

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Pressable
            onPress={pickImage}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#777" : theme.secondaryBtn,
              borderColor: theme.border,
              borderWidth: 1,
              padding: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: theme.text, textAlign: "center" }}>
              {loading ? "Please wait..." : "Select photo"}
            </Text>
          </Pressable>

          <Pressable
            onPress={takePhoto}
            disabled={loading}
            style={{
              flex: 1,
              backgroundColor: loading ? "#777" : theme.secondaryBtn,
              borderColor: theme.border,
              borderWidth: 1,
              padding: 12,
              borderRadius: 10,
            }}
          >
            <Text
              style={{
                color: theme.text,
                textAlign: "center",
              }}
            >
              {loading ? "Please wait..." : "Camera"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={analyzeImage}
          disabled={isDisabled}
          style={{
            marginTop: 20,
            backgroundColor: theme.button,
            padding: 12,
            borderRadius: 10,
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
            gap: 8,
            opacity: isDisabled ? 0.6 : 1,
          }}
        >
          {loading ? (
            <>
              <Text style={{ color: theme.buttonText }}>Analyzing</Text>
              <ActivityIndicator size="small" color={theme.buttonText} />
            </>
          ) : (
            <Text style={{ color: theme.buttonText }}>Analyze</Text>
          )}
        </Pressable>

        {!image && result?.error && (
          <Text
            style={{
              color: "red",
              marginTop: 14,
              textAlign: "center",
              fontSize: 13,
            }}
          >
            {result.error}
          </Text>
        )}

        {image && (                                                     // show image + result
          <View style={{ marginTop: 20 }}>
            <View style={{ flexDirection: "row", marginBottom: 10 }}>
              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>Image</Text>
              </View>

              <View style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontSize: 16 }}>Result</Text>
              </View>
            </View>

            <View
              style={{
                marginTop: 20,
                backgroundColor: theme.secondaryBtn,
                padding: 12,
                borderRadius: 12,
                flexDirection: "row",
              }}
            >
              <View style={{ flex: 1, alignItems: "center" }}>
                <Image
                  source={{ uri: image.uri }}
                  style={{ width: 120, height: 120, borderRadius: 10 }}
                />
              </View>

              <View
                style={{
                  width: 1,
                  backgroundColor: "#bb4e00",
                  marginHorizontal: 10,
                }}
              />

              <View style={{ flex: 1 }}>
                {loading && <ActivityIndicator />}

                {result && (
                  <>
                    {result.error && (
                      <Text style={{ color: "red", textAlign: "center" }}>
                        {result.error}
                      </Text>
                    )}

                    {!result.error && !result.valid && (
                      <>
                        <Text style={{ color: "yellow", fontWeight: "bold" }}>
                          Invalid
                        </Text>
                        <Text style={{ color: "gray" }}>{result.reason}</Text>
                      </>
                    )}

                    {result.valid && result.cleanliness?.status === "clean" && (
                      <>
                        <Text style={{ color: "#4ade80", fontWeight: "bold" }}>
                          Clean
                        </Text>
                        <Text style={{ color: "gray" }}>
                          {(result.cleanliness.confidence * 100).toFixed(0)}%
                        </Text>
                      </>
                    )}

                    {result.valid && result.cleanliness?.status === "dirty" && (
                      <>
                        <Text style={{ color: "#f87171", fontWeight: "bold" }}>
                          Dirty
                        </Text>
                        <Text style={{ color: theme.subText, marginBottom: 6 }}>
                          {(result.cleanliness.confidence * 100).toFixed(0)}%
                        </Text>

                        {result.cleanliness.issues?.map((issue, i) => (
                          <Text
                            key={issue} // using index as key causes react to re-render incorrectly if the order changes. Better use content as key since issues are unique strings
                            style={{
                              backgroundColor: theme.secondaryBtn,
                              borderColor: theme.border,
                              borderWidth: 1,
                              borderRadius: 8,
                              padding: 6,
                              marginBottom: 5,
                              color: theme.text,
                              fontSize: 12,
                            }}
                          >
                            • {issue}
                          </Text>
                        ))}
                      </>
                    )}

                    {result.valid &&
                      result.cleanliness?.status !== "clean" &&
                      result.cleanliness?.status !== "dirty" && (
                        <Text style={{ color: "yellow", fontWeight: "bold" }}>
                          Uncertain
                        </Text>
                      )}
                  </>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
