import { useNotification } from "../contexts/notification";
import {
  usePublicKey,
  useConnection,
  View,
  Image,
  Text,
  Button,
  Tab,
  List,
  Loading,
  ListItem,
} from "react-xnft";
import { THEME } from "../utils/theme";
import { useEffect } from "react";

export function Notification() {
  const { message, type } = useNotification();
  const color = type == 'error' ? THEME.colors.error : type == 'success' ? THEME.colors.success : THEME.colors.info
  useEffect(() => {
    console.log("logging msg", message);
  }, [message])
  return (
    <View>
      {message && type && (
        <View style={{
          position: 'absolute',
          top: '60px',
          width: '80%',
          left: '10%',
          zIndex: '1000',
          color: 'white',
          borderRadius: '4px',
          boxShadow: '0px 3px 5px -1px rgb(0 0 0 / 20%), 0px 6px 10px 0px rgb(0 0 0 / 14%), 0px 1px 18px 0px rgb(0 0 0 / 12%)',
          backgroundColor: color,
        }}>
          <Text style={{
            textAlign: 'center',
          }}>{message}</Text>
        </View>
      )}
    </View>
  )
}