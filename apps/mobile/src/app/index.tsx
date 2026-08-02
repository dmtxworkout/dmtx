import { View } from 'react-native';
import { Loading } from '../components/ui';

/** Entry route. The AuthGate in the root layout redirects to (auth) or (app). */
export default function Index() {
  return (
    <View className="flex-1 bg-bg">
      <Loading />
    </View>
  );
}
