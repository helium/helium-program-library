import {
  useNavigation,
  View,
  Image,
  Text,
  Button,
  Stack,
  Loading,
} from "react-xnft";
import { useTokenAccounts } from "../utils/index";

const STATS = "https://api.degods.com/v1/stats";

export function GridScreen() {
  const tokenAccounts = useTokenAccounts()!;

  if (tokenAccounts === null) {
    return <LoadingIndicator />;
  }

  return (
    <Grid
      tokenAccounts={tokenAccounts}
    />
  );
}

function Grid({ tokenAccounts }: any) {


  return (
    <View
      style={{
        marginRight: "20px",
        marginLeft: "20px",
        marginBottom: "38px",
      }}
    >
      <View
        style={{
          marginTop: "8px",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {tokenAccounts.map((g) => {
          return (
            <View>
              <Image
                src={g.tokenMetaUriData.image}
                style={{
                  borderRadius: "6px",
                  width: "157.5px",
                }}
              />
              <View
                style={{
                  marginTop: "3px",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <Text
                  style={{
                    fontSize: "12px",
                    lineHeight: "19.08px",
                  }}
                >
                  {g.tokenMetaUriData.name}
                </Text>
                <View style={{ display: "flex" }}>
                  <View
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      marginRight: "2px",
                    }}
                  >
                    {/* {g.isStaked ? <LockIcon /> : <UnlockIcon />} */}
                  </View>
                  <Text
                    style={{
                      fontSize: "12px",
                      lineHeight: "19.08px",
                    }}
                  >
                    {"Staked"}
                  </Text>
                </View>
              </View>
            </View>
          );
        })}
      </View>
      <View
        style={{
          marginTop: "24px",
          marginBottom: "24px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Text
          style={{
            fontSize: "12px",
            textAlign: "center",
          }}
        >
          👋 Browse Magic Eden
        </Text>
      </View>
    </View>
  );
}

function LoadingIndicator() {
  return (
    <View
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        height: "100%",
      }}
    >
      <Loading
        style={{ display: "block", marginLeft: "auto", marginRight: "auto" }}
      />
    </View>
  );
}
