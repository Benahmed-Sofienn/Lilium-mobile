import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        // Optional: hide the bottom tab bar if you want this dashboard to be the only visible “home” UI for now
        tabBarStyle: { display: "none" },
      }}
    >
      {/* IMPORTANT: explicitly include index */}
      <Tabs.Screen name="index" />
      



    </Tabs>
  );
}
